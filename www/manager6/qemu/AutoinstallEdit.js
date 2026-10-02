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

        if (ai.file) {
            let storage = ai.file.split(':')[0];
            me.lookup('storage').setValue(storage);
            me.lookup('file').setStorage(storage);
            data.file = ai.file;
        }

        me.callParent([data]);
    },

    column1: [
        {
            xtype: 'proxmoxcheckbox',
            name: 'enabled',
            fieldLabel: gettext('Enabled'),
            uncheckedValue: 0,
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
