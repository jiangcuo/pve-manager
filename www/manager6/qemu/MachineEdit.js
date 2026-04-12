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
            pc: (get) => get('type') === 'pc',
            virt: (get) => get('type') === 'virt',
            pseries: (get) => get('type') === 'pseries',
            's390-ccw-virtio': (get) => get('type') === 's390-ccw-virtio',
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
        let _me = this;

        let machineConf = PVE.Parser.parsePropertyString(values.machine, 'type');
        values.machine = machineConf.type;

        _me.isWindows = values.isWindows;

        let singleMachineArch = {
            'loongarch64': 'virt',
            'riscv64': 'virt',
            'ppc64': 'pseries',
            's390x': 's390-ccw-virtio',
        };
        let arch = values.arch;
        delete values.arch;

        if (values.machine === 'pc') {
            values.machine = '__default__';
        }

        let lockedType = singleMachineArch[arch];
        if (lockedType) {
            let machineCombo = _me.down('combobox[name=machine]');
            if (machineCombo) {
                machineCombo.setReadOnly(true);
            }
        }

        let knownTypes = ['__default__', 'q35', 'virt', 'pseries', 's390-ccw-virtio'];
        if (!knownTypes.includes(values.machine)) {
            values.version = values.machine;
            if (values.machine.match(/q35/)) {
                values.machine = 'q35';
            } else if (values.machine.match(/virt/)) {
                values.machine = 'virt';
            } else if (values.machine.match(/pseries/)) {
                values.machine = 'pseries';
            } else if (values.machine.match(/s390/)) {
                values.machine = 's390-ccw-virtio';
            } else {
                values.machine = '__default__';
            }
            _me.setAdvancedVisible(true);
        }

        values.viommu = machineConf.viommu || '__default__';

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
                    url: '/api2/json/nodes/localhost/capabilities/qemu/machines',
                },
                listeners: {
                    load: function (records) {
                        
                            this.insert(0, {
                                id: 'latest',
                                type: 'any',
                                version: gettext('Latest'),
                            });
                        
                    },
                },
            },
        },
        {
            xtype: 'displayfield',
            fieldLabel: gettext('Note'),
            value: gettext(
                'Machine version change may affect hardware layout and settings in the guest OS.',
            ),
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
                values.arch = conf.arch;
                me.setValues(values);
            },
        });
    },
});
