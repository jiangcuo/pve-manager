Ext.define('PVE.form.RdpEnhancementSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveRdpEnhancementSelector',

    viewModel: {},

    items: [
        {
            xtype: 'proxmoxKVComboBox',
            itemId: 'encoder',
            name: 'encoder',
            value: 'auto',
            fieldLabel: gettext('Encoder'),
            comboItems: [
                ['auto', gettext('Automatic')],
                ['openh264', 'openh264 (CPU)'],
                ['vaapi', 'VA-API (GPU)'],
            ],
        },
        {
            xtype: 'proxmoxtextfield',
            itemId: 'encodernode',
            name: 'encodernode',
            deleteEmpty: false,
            emptyText: gettext('Automatic'),
            fieldLabel: gettext('Encoder Node'),
            regex: /^(auto|renderD\d+)$/,
            regexText: 'renderD<N>',
        },
        {
            xtype: 'proxmoxintegerfield',
            itemId: 'maxfps',
            name: 'maxfps',
            minValue: 1,
            maxValue: 120,
            emptyText: '60',
            fieldLabel: gettext('Max FPS'),
        },
        {
            xtype: 'proxmoxintegerfield',
            itemId: 'bitrate',
            name: 'bitrate',
            minValue: 1,
            maxValue: 1000,
            emptyText: gettext('Automatic'),
            fieldLabel: gettext('Bitrate') + ' (Mbit/s)',
        },
        {
            xtype: 'proxmoxcheckbox',
            itemId: 'resizeonconnect',
            name: 'resizeonconnect',
            checked: true,
            fieldLabel: gettext('Resize on Connect'),
        },
    ],

    onGetValues: function (values) {
        var ret = {};

        if (values.encoder !== 'auto') {
            ret.encoder = values.encoder;
        }
        if (values.encodernode && values.encodernode !== 'auto') {
            ret.encodernode = values.encodernode;
        }
        if (values.maxfps) {
            ret.maxfps = values.maxfps;
        }
        if (values.bitrate) {
            ret.bitrate = values.bitrate;
        }
        if (!values.resizeonconnect) {
            ret.resizeonconnect = 0;
        }
        if (Ext.Object.isEmpty(ret)) {
            return { delete: 'rdp_enhancements' };
        }
        var enhancements = PVE.Parser.printPropertyString(ret);
        return { rdp_enhancements: enhancements };
    },

    setValues: function (values) {
        if (values.rdp_enhancements) {
            let enhancements = PVE.Parser.parsePropertyString(values.rdp_enhancements);
            this.callParent([enhancements]);
        }
    },
});
