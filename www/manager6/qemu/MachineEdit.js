Ext.define('PVE.qemu.MachineInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveMachineInputPanel',
    onlineHelp: 'qm_machine_type',

    viewModel: {
        data: {
            type: '__default__',
        },
        formulas: {
            q35: (get) => get('type') === 'q35',
		pc: get => get('type') === 'pc',
		virt: get => get('type') === 'virt',
		pseries: get => get('type') === 'pseries',
		's390-ccw-virtio': get => get('type') === 's390-ccw-virtio',
        },
    },

    controller: {
	xclass: 'Ext.app.ViewController',
	control: {
	    'combobox[name=machine]': {
		change: 'onMachineChange',
	    },
	},
	onMachineChange: function(field, value) {
	    let me = this;
	    let version = me.lookup('version');
	    let store = version.getStore();
		if (value === 'pc'){
		    value = 'i440fx';
		}
		store.clearFilter();
		console.log('value is '+ value)
		if (value === null || value === '__default__') {
			store.addFilter(val => val.data.id === 'latest');
		}else{
			store.addFilter(val => val.data.id === 'latest' || val.data.type === value);
		}
	},
    },

    onGetValues: function (values) {
        if (values.delete === 'machine' && values.viommu) {
            delete values.delete;
            values.machine = 'pc';
        }
        if (values.version && values.version !== 'latest') {
            values.machine = values.version;
            delete values.delete;
        }
        delete values.version;
        if (values.delete === 'machine' && !values.viommu) {
            return values;
        }
        let ret = {};
        ret.machine = PVE.Parser.printPropertyString(values, 'machine');
        return ret;
    },

    setValues: function (values) {
        let me = this;

	let machineConf = PVE.Parser.parsePropertyString(values.machine, 'type');
	values.machine = machineConf.type;

        values.viommu = machineConf.viommu || '__default__';

	// if (values.machine !== '__default__' && values.machine !== 'q35') {
	//     values.version = values.machine;
	//     values.machine = values.version.match(/q35/) ? 'q35' : '__default__';

	//     // avoid hiding a pinned version
	//     me.setAdvancedVisible(true);
	// }

        this.callParent(arguments);
    },

    items: {
        xtype: 'proxmoxKVComboBox',
        name: 'machine',
        reference: 'machine',
        fieldLabel: gettext('Machine'),
        comboItems: [
            ['__default__', PVE.Utils.render_qemu_machine('')],
            ['q35', 'q35'],
	    ['virt', 'virt'],
	    ['pc', 'i440fx'],
		['pseries','pseries'],
		['s390-ccw-virtio','s390-ccw-virtio']
        ],
        bind: {
            value: '{type}',
        },
    },

    advancedItems: [
	{
	    xtype: 'combobox',
	    name: 'version',
	    reference: 'version',
	    fieldLabel: gettext('Version'),
	    emptyText: gettext('Latest'),
	    value: 'latest',
	    editable: false,
	    valueField: 'id',
	    displayField: 'version',
	    queryParam: false,
	    store: {
		autoLoad: true,
		fields: ['id', 'type', 'version'],
		proxy: {
		    type: 'proxmox',
		    url: "/api2/json/nodes/localhost/capabilities/qemu/machines",
		},
		listeners: {
		    load: function(records) {
			
			    this.insert(0, { id: 'latest', type: 'any', version: gettext('Latest') });
			
		    },
		},
	    },
	},
	{
	    xtype: 'displayfield',
	    fieldLabel: gettext('Note'),
	    value: gettext('Machine version change may affect hardware layout and settings in the guest OS.'),
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'viommu',
	    fieldLabel: gettext('vIOMMU'),
	    reference: 'viommu-q35',
	    deleteEmpty: false,
	    value: '__default__',
	    comboItems: [
		['__default__', Proxmox.Utils.defaultText + ' (None)'],
		['intel', gettext('Intel (AMD Compatible)')],
		['virtio', 'VirtIO'],
	    ],
	    bind: {
		hidden: '{!q35}',
		disabled: '{!q35}',
	    },
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'viommu',
	    fieldLabel: gettext('vIOMMU'),
	    reference: 'viommu-i440fx',
	    deleteEmpty: false,
	    value: '__default__',
	    comboItems: [
		['__default__', Proxmox.Utils.defaultText + ' (None)'],
		['virtio', 'VirtIO'],
	    ],
	    bind: {
		hidden: '{q35}',
		disabled: '{q35}',
	    },
	},
    ],
});

Ext.define('PVE.qemu.MachineEdit', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('Machine'),

    items: {
        xtype: 'pveMachineInputPanel',
    },

    width: 400,

    initComponent: function () {
        let me = this;

        me.callParent();

        me.load({
            success: function (response) {
                let conf = response.result.data;
                let values = {
                    machine: conf.machine || '__default__',
                };
                values.isWindows = PVE.Utils.is_windows(conf.ostype);
                me.setValues(values);
            },
        });
    },
});
