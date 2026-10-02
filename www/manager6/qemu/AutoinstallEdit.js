Ext.define('PVE.qemu.AutoinstallInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveQemuAutoinstallInputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    referenceHolder: true,

    onlineHelp: 'qm_cloud_init',

    textKeys: ['disk', 'locale', 'keyboard', 'edition', 'productkey'],

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
        for (const key of me.textKeys) {
            let value = values[key]?.trim();
            if (value) {
                ai[key] = value;
            }
        }

        if (!ai.enabled && Object.keys(ai).length === 1) {
            return { delete: 'autoinstall' };
        }
        return { autoinstall: PVE.Parser.printPropertyString(ai, 'enabled') };
    },

    setValues: function (values) {
        let me = this;

        let ai = PVE.Parser.parsePropertyString(values.autoinstall ?? '', 'enabled') ?? {};
        let data = {
            enabled: PVE.Parser.parseBoolean(ai.enabled, false),
            type: ai.type || '__default__',
            useCustom: !!ai.file,
        };
        for (const key of me.textKeys) {
            data[key] = ai[key] ?? '';
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
            fieldLabel: gettext('Enable'),
            uncheckedValue: 0,
        },
        {
            xtype: 'proxmoxKVComboBox',
            name: 'type',
            fieldLabel: gettext('Installer'),
            value: '__default__',
            comboItems: [
                ['__default__', Proxmox.Utils.defaultText + ' (' + gettext('by OS type') + ')'],
                ['windows', 'Windows (autounattend.xml)'],
                ['kickstart', 'Kickstart (RHEL/Rocky/Alma/Fedora)'],
                ['ubuntu', 'Ubuntu autoinstall'],
            ],
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'useCustom',
            reference: 'useCustom',
            fieldLabel: gettext('Custom file'),
            boxLabel: gettext('Use a snippet instead of generating the file'),
            submitValue: true,
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
            xtype: 'proxmoxtextfield',
            name: 'locale',
            fieldLabel: gettext('Locale'),
            emptyText: 'en_US.UTF-8 / en-US',
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'keyboard',
            fieldLabel: gettext('Keyboard'),
            emptyText: 'us / en-US',
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'disk',
            fieldLabel: gettext('Target disk'),
            emptyText: gettext('auto (boot disk)'),
        },
    ],

    advancedColumn1: [
        {
            xtype: 'proxmoxtextfield',
            name: 'edition',
            fieldLabel: gettext('Windows edition'),
            emptyText: '1 / Windows 11 Pro',
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'productkey',
            fieldLabel: gettext('Product key'),
            emptyText: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
            regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
        },
    ],

    columnB: [
        {
            xtype: 'displayfield',
            userCls: 'pmx-hint',
            value:
                gettext(
                    'The installation file replaces the regular cloud-init data on the cloud-init drive. User, password, SSH keys, DNS and IP config are taken from the cloud-init settings.',
                ) +
                '<br>' +
                gettext(
                    'Attach the installation ISO and boot from disk first, then CD-ROM. Windows needs the VirtIO driver ISO for VirtIO disks and NICs, and the locale must match the ISO language. Ubuntu asks once to confirm the autoinstall.',
                ) +
                '<br>' +
                gettext('Placeholders in custom files') +
                ': {{hostname}}, {{fqdn}}, {{username}}, {{password}}, {{password_hash}}, {{sshkeys}}, {{ip}}, {{netmask}}, {{gw}}, {{nameserver}}, {{disk}}, {{timezone}} (host), {{net0_mac}}, ...',
        },
    ],
});

Ext.define('PVE.qemu.AutoinstallEdit', {
    extend: 'Proxmox.window.Edit',

    width: 800,

    initComponent: function () {
        let me = this;

        let nodename = me.pveSelNode.data.node;

        let ipanel = Ext.create('PVE.qemu.AutoinstallInputPanel', {
            nodename,
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

    title: gettext('Autoinstall') + ' - ' + gettext('Preview'),
    width: 800,
    height: 600,
    modal: true,
    layout: 'fit',

    items: [
        {
            xtype: 'textarea',
            readOnly: true,
            fieldStyle: {
                'font-family': 'monospace',
                'white-space': 'pre',
            },
        },
    ],

    initComponent: function () {
        let me = this;

        me.callParent();

        let textarea = me.down('textarea');
        Proxmox.Utils.API2Request({
            url: `/nodes/${me.nodename}/qemu/${me.vmid}/cloudinit/dump`,
            params: { type: 'autoinstall' },
            method: 'GET',
            waitMsgTarget: me,
            failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
            success: function (response) {
                textarea.setValue(response.result.data || gettext('Autoinstall is not enabled'));
            },
        });
    },
});
