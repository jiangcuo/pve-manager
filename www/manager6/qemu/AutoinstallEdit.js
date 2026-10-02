Ext.define('PVE.qemu.AutoinstallInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveQemuAutoinstallInputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    referenceHolder: true,

    onlineHelp: 'qm_cloud_init',

    textKeys: ['edition', 'productkey'],

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
            xtype: 'proxmoxtextfield',
            name: 'edition',
            fieldLabel: gettext('Edition'),
            emptyText: Proxmox.Utils.defaultText,
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'productkey',
            fieldLabel: gettext('Product Key'),
            emptyText: Proxmox.Utils.noneText,
            regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
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
