Ext.define('PVE.qemu.AutoinstallInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveQemuAutoinstallInputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    referenceHolder: true,

    onlineHelp: 'qm_cloud_init',

    textKeys: ['timezone', 'edition', 'productkey'],

    onGetValues: function (values) {
        let me = this;

        let ai = {
            enabled: values.enabled ? 1 : 0,
        };
        if (values.type && values.type !== '__default__') {
            ai.type = values.type;
        }
        if (values.useCustom && values.file) {
            ai.file = values.file;
        }
        if (values.rdp) {
            ai.rdp = 1;
        }
        for (const key of me.textKeys) {
            let value = values[key]?.trim();
            if (value) {
                ai[key] = value;
            }
        }

        let params = {};
        let deletes = [];
        if (!ai.enabled && Object.keys(ai).length === 1) {
            deletes.push('autoinstall');
        } else {
            params.autoinstall = PVE.Parser.printPropertyString(ai, 'enabled');
        }

        // domain join, separate options as the password must not be readable
        let loaded = me.loadedValues ?? {};
        for (const key of ['cidomain', 'cidomainuser', 'cidomainou']) {
            let value = values[key]?.trim();
            if (value) {
                params[key] = value;
            } else if (loaded[key] !== undefined) {
                deletes.push(key);
            }
        }
        if (values.cidomainpassword) {
            params.cidomainpassword = values.cidomainpassword;
        } else if (!params.cidomain && loaded.cidomainpassword !== undefined) {
            deletes.push('cidomainpassword');
        }

        if (deletes.length) {
            params.delete = deletes.join(',');
        }
        return params;
    },

    setValues: function (values) {
        let me = this;

        me.loadedValues = values;

        let ai = PVE.Parser.parsePropertyString(values.autoinstall ?? '', 'enabled') ?? {};
        let data = {
            enabled: PVE.Parser.parseBoolean(ai.enabled, false),
            type: ai.type || '__default__',
            useCustom: !!ai.file,
            rdp: PVE.Parser.parseBoolean(ai.rdp, false),
        };
        for (const key of me.textKeys) {
            data[key] = ai[key] ?? '';
        }

        for (const key of ['cidomain', 'cidomainuser', 'cidomainou']) {
            data[key] = values[key] ?? '';
        }
        if (values.cidomainpassword !== undefined) {
            me.down('field[name=cidomainpassword]').setEmptyText(gettext('unchanged'));
        }

        me.vmOstype = values.ostype;
        me.loadedType = data.type;
        me.autoSelectedType = undefined;
        me.isos = undefined;
        me.iso = undefined;

        if (ai.file) {
            let storage = ai.file.split(':')[0];
            me.lookup('storage').setValue(storage);
            me.lookup('file').setStorage(storage);
            data.file = ai.file;
        }

        me.callParent([data]);

        me.updateTypeFields();
        me.detectIso(values);
    },

    // the installer the backend uses, it defaults to the one of the guest OS type
    effectiveType: function () {
        let me = this;
        let type = me.down('field[name=type]').getValue();
        if (type && type !== '__default__') {
            return type;
        }
        return PVE.Utils.is_windows(me.vmOstype) ? 'windows' : 'kickstart';
    },

    // only show the options of the selected installer, hidden fields keep their values, so
    // nothing gets lost when switching the installer back
    updateTypeFields: function () {
        let me = this;
        let type = me.effectiveType();
        let isWindows = type === 'windows';
        for (const name of [
            'edition',
            'productkey',
            'rdp',
            'cidomain',
            'cidomainuser',
            'cidomainpassword',
            'cidomainou',
        ]) {
            me.down(`field[name=${name}]`).setHidden(!isWindows);
        }

        // show what was detected on the attached installation ISO
        let hint = me.lookup('isoHint');
        let icon = '<i class="fa fa-exclamation-triangle warning"></i>';
        if (!me.isos) {
            hint.setHidden(true); // still detecting, or the detection is not available
            return;
        }
        if (!me.iso) {
            let text = gettext('No installation ISO detected, attach one as CD/DVD drive.');
            hint.setValue(`${icon} ${Ext.htmlEncode(text)}`);
            hint.setHidden(false);
            return;
        }
        let info = me.iso.info;
        let name = [info.name, info.version, info.arch].filter((v) => v).join(' ');
        let text = Ext.String.format(
            gettext('Detected on {0}: {1}'),
            `${me.iso.key} (${me.iso.volid})`,
            name || info.type,
        );
        let warning;
        if (!info.installer) {
            warning = gettext('The unattended installation does not support this ISO.');
        } else if (info.installer !== type) {
            warning = Ext.String.format(
                gettext('The ISO needs the installer type {0}.'),
                me.typeNames[info.installer] ?? info.installer,
            );
        }
        text = Ext.htmlEncode(text);
        if (warning) {
            text += `<br>${icon} ${Ext.htmlEncode(warning)}`;
        }
        hint.setValue(text);
        hint.setHidden(false);
    },

    typeNames: {
        windows: 'Windows',
        kickstart: 'Kickstart',
        ubuntu: 'Ubuntu',
    },

    // detect all attached ISOs, the installation ISOs are offered for selection if there are
    // more than one, in boot order, as the first one is the one that is booted
    detectIso: async function (values) {
        let me = this;

        let order = (values.boot ?? '').match(/(?:^|,)order=([^,]*)/)?.[1]?.split(';') ?? [];
        let rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);

        let drives = [];
        for (const [key, value] of Object.entries(values)) {
            if (!/^(?:ide|sata|scsi)\d+$/.test(key)) {
                continue;
            }
            let drive = PVE.Parser.parseQemuDrive(key, value);
            if (drive?.media === 'cdrom' && /^[^:]+:iso\/.+\.iso$/i.test(drive.file)) {
                drives.push({ key, volid: drive.file });
            }
        }
        drives.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));

        let results = await Promise.all(
            drives.map(async (drive) => {
                try {
                    let { result } = await Proxmox.Async.api2({
                        url: `/nodes/${me.nodename}/storage/${drive.volid.split(':')[0]}/iso-info`,
                        method: 'GET',
                        params: { volume: drive.volid },
                    });
                    return { ...drive, info: result.data };
                } catch (_error) {
                    return undefined;
                }
            }),
        );
        if (me.destroyed) {
            return;
        }

        if (drives.length && results.every((iso) => !iso)) {
            return; // the detection is not available, e.g. pxvirt-isoinfo is missing
        }
        // skip other ISOs, e.g. the VirtIO drivers
        me.isos = results.filter((iso) => iso?.info && iso.info.type !== 'unknown');

        let selector = me.lookup('isoDevice');
        selector.getStore().setData(
            me.isos.map((iso) => ({ key: iso.key, text: `${iso.key}: ${iso.volid}` })),
        );
        selector.setHidden(me.isos.length < 2);
        if (me.isos.length) {
            selector.setValue(me.isos[0].key); // applies it with the change listener
        } else {
            me.applyIso(undefined);
        }
    },

    // offer the images of a Windows ISO as editions and select the installer of the ISO
    applyIso: function (key) {
        let me = this;

        me.iso = me.isos?.find((iso) => iso.key === key);
        let info = me.iso?.info ?? {};

        // the property string cannot hold ',', ';' or '=', select those by index
        let names = (info.images ?? []).map((image) =>
            /[,;=]/.test(image.name) ? `${image.index}` : image.name,
        );
        me.down('field[name=edition]').setStore(
            names.length ? names : PVE.Utils.windows_editions(),
        );

        me.updateAutoType();
        me.updateTypeFields();
    },

    // select the installer of the ISO if none was selected yet, only with the unattended
    // installation enabled, so that just opening the window does not change the config
    updateAutoType: function () {
        let me = this;
        let typeField = me.down('field[name=type]');
        let installer = me.iso?.info?.installer;

        // undo the installer selected before, e.g. for another ISO
        if (me.autoSelectedType && typeField.getValue() === me.autoSelectedType) {
            typeField.setValue(me.loadedType);
            me.autoSelectedType = undefined;
        }
        // the default depends on the guest OS type only, e.g. it is kickstart for an Ubuntu ISO
        if (
            me.down('field[name=enabled]').getValue() &&
            installer &&
            typeField.getValue() === '__default__' &&
            me.effectiveType() !== installer
        ) {
            typeField.setValue(installer);
            me.autoSelectedType = installer;
        }
    },

    column1: [
        {
            xtype: 'proxmoxcheckbox',
            name: 'enabled',
            fieldLabel: gettext('Enabled'),
            uncheckedValue: 0,
            listeners: {
                change: function (field) {
                    field.up('inputpanel').updateAutoType();
                },
            },
        },
        {
            xtype: 'proxmoxKVComboBox',
            name: 'type',
            fieldLabel: gettext('Type'),
            value: '__default__',
            comboItems: [
                ['__default__', Proxmox.Utils.defaultText],
                ['windows', 'Windows'],
                ['kickstart', 'Kickstart'],
                ['ubuntu', 'Ubuntu'],
            ],
            listeners: {
                change: function (field) {
                    field.up('inputpanel').updateTypeFields();
                },
            },
        },
        {
            xtype: 'combobox',
            reference: 'isoDevice',
            isFormField: false,
            fieldLabel: gettext('ISO'),
            hidden: true,
            editable: false,
            queryMode: 'local',
            valueField: 'key',
            displayField: 'text',
            store: {
                fields: ['key', 'text'],
                data: [],
            },
            listeners: {
                change: function (field, value) {
                    field.up('inputpanel').applyIso(value);
                },
            },
        },
        {
            xtype: 'displayfield',
            reference: 'isoHint',
            submitValue: false,
            hidden: true,
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'useCustom',
            fieldLabel: gettext('Custom File'),
            listeners: {
                change: function (field, value) {
                    let panel = field.up('inputpanel');
                    panel.lookup('storage').setDisabled(!value);
                    panel.lookup('file').setDisabled(!value);
                },
            },
        },
        {
            xtype: 'pveStorageSelector',
            reference: 'storage',
            isFormField: false,
            fieldLabel: gettext('Storage'),
            storageContent: 'snippets',
            disabled: true,
            autoSelect: true,
            cbind: {
                nodename: '{nodename}',
            },
            listeners: {
                change: function (field, value) {
                    let panel = field.up('inputpanel');
                    panel.lookup('file').setStorage(value);
                },
            },
        },
        {
            xtype: 'pveFileSelector',
            reference: 'file',
            name: 'file',
            fieldLabel: gettext('Snippet'),
            storageContent: 'snippets',
            disabled: true,
            cbind: {
                nodename: '{nodename}',
            },
        },
    ],

    column2: [
        {
            xtype: 'combo',
            name: 'timezone',
            fieldLabel: gettext('Time zone'),
            queryMode: 'local',
            store: Ext.create('Proxmox.data.TimezoneStore'),
            displayField: 'zone',
            valueField: 'zone',
            editable: true,
            anyMatch: true,
            forceSelection: true,
            allowBlank: true,
            emptyText: Proxmox.Utils.defaultText,
        },
        {
            xtype: 'combobox',
            name: 'edition',
            fieldLabel: gettext('Edition'),
            queryMode: 'local',
            store: PVE.Utils.windows_editions(),
            editable: true,
            forceSelection: false,
            anyMatch: true,
            emptyText: Proxmox.Utils.defaultText,
            // the property string cannot hold these, select such images by index
            regex: /^[^,;=]*$/,
            regexText: gettext("Use the image index for names with ',', ';' or '='"),
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'productkey',
            fieldLabel: gettext('Product Key'),
            emptyText: Proxmox.Utils.noneText,
            regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'rdp',
            fieldLabel: gettext('Remote Desktop'),
            uncheckedValue: 0,
        },
    ],

    advancedColumn1: [
        {
            xtype: 'textfield',
            name: 'cidomain',
            fieldLabel: gettext('Domain'),
            emptyText: Proxmox.Utils.noneText,
        },
        {
            xtype: 'textfield',
            name: 'cidomainuser',
            fieldLabel: gettext('Domain User'),
        },
    ],

    advancedColumn2: [
        {
            xtype: 'textfield',
            name: 'cidomainpassword',
            inputType: 'password',
            fieldLabel: gettext('Domain Password'),
        },
        {
            xtype: 'textfield',
            name: 'cidomainou',
            fieldLabel: 'OU',
            emptyText: Proxmox.Utils.defaultText,
        },
    ],
});

Ext.define('PVE.qemu.AutoinstallEdit', {
    extend: 'Proxmox.window.Edit',

    initComponent: function () {
        let me = this;

        let ipanel = Ext.create('PVE.qemu.AutoinstallInputPanel', {
            nodename: me.pveSelNode.data.node,
        });

        Ext.apply(me, {
            subject: gettext('Autoinstall'),
            items: [ipanel],
        });

        me.callParent();

        me.load({
            success: function (response) {
                ipanel.setValues(response.result.data);
            },
        });
    },
});

Ext.define('PVE.qemu.AutoinstallPreview', {
    extend: 'Ext.window.Window',
    title: gettext('Autoinstall'),
    width: 800,
    height: 600,
    layout: 'fit',
    modal: true,
    items: {
        xtype: 'component',
        itemId: 'configtext',
        autoScroll: true,
        style: {
            'white-space': 'pre',
            'font-family': 'monospace',
            padding: '5px',
        },
    },

    initComponent: function () {
        var me = this;

        var nodename = me.pveSelNode.data.node;
        if (!nodename) {
            throw 'no node name specified';
        }

        var vmid = me.pveSelNode.data.vmid;
        if (!vmid) {
            throw 'no VM ID specified';
        }

        me.callParent();

        Proxmox.Utils.API2Request({
            url: '/nodes/' + nodename + '/qemu/' + vmid + '/cloudinit/dump',
            method: 'GET',
            params: {
                type: 'autoinstall',
            },
            failure: function (response, opts) {
                me.close();
                Ext.Msg.alert('Error', response.htmlStatus);
            },
            success: function (response, options) {
                me.show();
                me.down('#configtext').update(Ext.htmlEncode(response.result.data));
            },
        });
    },
});
