/*jslint confusion: true*/
/* hidden: boolean and string
 * bind: function and object
 * disabled: boolean and string
 */
Ext.define('PVE.lxc.MountPointInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveLxcMountPointInputPanel',

    insideWizard: false,

    onlineHelp: 'pct_container_storage',

    unused: false, // add unused disk imaged

    unprivileged: false,

    vmconfig: {}, // used to select unused disks

    setUnprivileged: function(unprivileged) {
	var me = this;
	var vm = me.getViewModel();
	me.unprivileged = unprivileged;
	vm.set('unpriv', unprivileged);
    },

    onGetValues: function(values) {
	var me = this;

	var confid = me.confid || "mp"+values.mpid;
	values.file = me.down('field[name=file]').getValue();
	if (values.mountoptions) {
	    values.mountoptions = values.mountoptions.join(';');
	}

	if (me.unused) {
	    confid = "mp"+values.mpid;
	} else if (me.isCreate) {
	    values.file = values.hdstorage + ':' + values.disksize;
	}

	// delete unnecessary fields
	delete values.mpid;
	delete values.hdstorage;
	delete values.disksize;
	delete values.diskformat;

	var res = {};
	res[confid] = PVE.Parser.printLxcMountPoint(values);
	return res;
    },


    setMountPoint: function(mp) {
	var me = this;
	var vm = this.getViewModel();
	vm.set('mptype', mp.type);
	if (mp.mountoptions) {
	    mp.mountoptions = mp.mountoptions.split(';');
	}
	me.setValues(mp);
    },

    setVMConfig: function(vmconfig) {
	var me = this;
	var vm = me.getViewModel();
	me.vmconfig = vmconfig;
	vm.set('unpriv', vmconfig.unprivileged);

	PVE.Utils.forEachMP(function(bus, i) {
	    var name = "mp" + i.toString();
	    if (!Ext.isDefined(vmconfig[name])) {
		me.down('field[name=mpid]').setValue(i);
		return false;
	    }
	});
    },

    setNodename: function(nodename) {
	var me = this;
	var vm = me.getViewModel();
	vm.set('node', nodename);
	me.down('#diskstorage').setNodename(nodename);
    },

    controller:  {
	xclass: 'Ext.app.ViewController',

	control: {
	    'field[name=mpid]': {
		change: function(field, value) {
		    field.validate();
		}
	    },
	    '#hdstorage': {
		change: function(field, newValue) {
		    var me = this;
		    if (!newValue) {
			return;
		    }

		    var rec = field.store.getById(newValue);
		    if (!rec) {
			return;
		    }

		    var vm = me.getViewModel();
		    vm.set('type', rec.data.type);
		}
	    }
	},

	init: function(view) {
	    var me = this;
	    var vm = this.getViewModel();
	    vm.set('confid', view.confid);
	    vm.set('unused', view.unused);
	    vm.set('node', view.nodename);
	    vm.set('unpriv', view.unprivileged);
	    vm.set('hideStorSelector', view.unused || !view.isCreate);
	}
    },

    viewModel: {
	data: {
	    unpriv: false,
	    unused: false,
	    showStorageSelector: false,
	    mptype: '',
	    type: '',
	    confid: '',
	    node: ''
	},

	formulas: {
	    quota: function(get) {
		return !(get('type') === 'zfs' ||
			 get('type') === 'zfspool' ||
			 get('unpriv') ||
			 get('isBind'));
	    },
	    hasMP: function(get) {
		return !!get('confid') && !get('unused');
	    },
	    isRoot: function(get) {
		return get('confid') === 'rootfs';
	    },
	    isBind: function(get) {
		return get('mptype') === 'bind';
	    },
	    isBindOrRoot: function(get) {
		return get('isBind') || get('isRoot');
	    }
	}
    },

    column1: [
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'mpid',
	    fieldLabel: gettext('Mount Point ID'),
	    minValue: 0,
	    maxValue: PVE.Utils.mp_counts.mps - 1,
	    hidden: true,
	    allowBlank: false,
	    disabled: true,
	    bind: {
		hidden: '{hasMP}',
		disabled: '{hasMP}'
	    },
	    validator: function(value) {
		var me = this.up('inputpanel');
		if (!me.rendered) {
		    return;
		}
		if (Ext.isDefined(me.vmconfig["mp"+value])) {
		    return "Mount point is already in use.";
		}
		/*jslint confusion: true*/
		/* returns a string above */
		return true;
	    }
	},
	{
	    xtype: 'pveDiskStorageSelector',
	    itemId: 'diskstorage',
	    storageContent: 'rootdir',
	    hidden: true,
	    autoSelect: true,
	    selectformat: false,
	    defaultSize: 8,
	    bind: {
		hidden: '{hideStorSelector}',
		disabled: '{hideStorSelector}',
		nodename: '{node}'
	    }
	},
	{
	    xtype: 'textfield',
	    disabled: true,
	    submitValue: false,
	    fieldLabel: gettext('Disk image'),
	    name: 'file',
	    bind: {
		hidden: '{!hideStorSelector}'
	    }
	}
    ],

    column2: [
	{
	    xtype: 'textfield',
	    name: 'mp',
	    value: '',
	    emptyText:  gettext('/some/path'),
	    allowBlank: false,
	    disabled: true,
	    fieldLabel: gettext('Path'),
	    bind: {
		hidden: '{isRoot}',
		disabled: '{isRoot}'
	    }
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'backup',
	    fieldLabel: gettext('Backup'),
	    bind: {
		hidden: '{isRoot}',
		disabled: '{isBindOrRoot}'
	    }
	}
    ],

    advancedColumn1: [
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'quota',
	    defaultValue: 0,
	    bind: {
		disabled: '{!quota}'
	    },
	    fieldLabel: gettext('Enable quota'),
	    listeners: {
		disable: function() {
		    this.reset();
		}
	    }
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'ro',
	    defaultValue: 0,
	    bind: {
		hidden: '{isRoot}',
		disabled: '{isRoot}'
	    },
	    fieldLabel: gettext('Read-only')
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'mountoptions',
	    fieldLabel: gettext('Mount options'),
	    deleteEmpty: false,
	    comboItems: [
		['noatime', 'noatime'],
		['nodev', 'nodev'],
		['noexec', 'noexec'],
		['nosuid', 'nosuid']
	    ],
	    multiSelect: true,
	    value: [],
	    allowBlank: true
	},
    ],

    advancedColumn2: [
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'acl',
	    fieldLabel: 'ACLs',
	    deleteEmpty: false,
	    comboItems: [
		['__default__', Proxmox.Utils.defaultText],
		['1', Proxmox.Utils.enabledText],
		['0', Proxmox.Utils.disabledText]
	    ],
	    value: '__default__',
	    bind: {
		disabled: '{isBind}'
	    },
	    allowBlank: true
	},
	{
	    xtype: 'proxmoxcheckbox',
	    inputValue: '0', // reverses the logic
	    name: 'replicate',
	    fieldLabel: gettext('Skip replication')
	}
    ]
});

Ext.define('PVE.lxc.MountPointEdit', {
    extend: 'Proxmox.window.Edit',

    unprivileged: false,

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var unused = me.confid && me.confid.match(/^unused\d+$/);

	me.isCreate = me.confid ? unused : true;

	var ipanel = Ext.create('PVE.lxc.MountPointInputPanel', {
	    confid: me.confid,
	    nodename: nodename,
	    unused: unused,
	    unprivileged: me.unprivileged,
	    isCreate: me.isCreate
	});

	var subject;
	if (unused) {
	    subject = gettext('Unused Disk');
	} else if (me.isCreate) {
	    subject = gettext('Mount Point');
	} else {
	    subject = gettext('Mount Point') + ' (' + me.confid + ')';
	}

	Ext.apply(me, {
	    subject: subject,
	    defaultFocus: me.confid !== 'rootfs' ? 'textfield[name=mp]' : 'tool',
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		ipanel.setVMConfig(response.result.data);
		if (me.confid) {
		    /*jslint confusion: true*/
		    /*data is defined as array above*/
		    var value = response.result.data[me.confid];
		    /*jslint confusion: false*/
		    var mp = PVE.Parser.parseLxcMountPoint(value);

		    if (!mp) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse mount point options');
			me.close();
			return;
		    }

		    ipanel.setMountPoint(mp);
		    me.isValid(); // trigger validation
		}
	    }
	});
    }
});
