Ext.define('PVE.qemu.OSTypeInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuOSTypePanel',
    onlineHelp: 'qm_os_settings',
    insideWizard: false,

    controller: {
        xclass: 'Ext.app.ViewController',
        control: {
            'combobox[name=osbase]': {
                change: 'onOSBaseChange',
            },
            'combobox[name=ostype]': {
                afterrender: 'onOSTypeChange',
                change: 'onOSTypeChange',
            },
            'checkbox[reference=enableSecondCD]': {
                change: 'onSecondCDChange',
            },
            'checkbox[reference=autoinstall]': {
                change: 'updateAutoinstall',
            },
        },
        onOSBaseChange: function (field, value) {
            let me = this;
            me.lookup('ostype').getStore().setData(PVE.Utils.kvm_ostypes[value]);
            if (me.getView().insideWizard) {
                let isWindows = value === 'Microsoft Windows';
                let enableSecondCD = me.lookup('enableSecondCD');
                enableSecondCD.setVisible(isWindows);
                if (!isWindows) {
                    enableSecondCD.setValue(false);
                }
            }
            me.updateAutoinstall();
        },
        onOSTypeChange: function (field) {
            var me = this,
                ostype = field.getValue();
            if (!me.getView().insideWizard) {
                return;
            }
            var targetValues = PVE.qemu.OSDefaults.getDefaults(ostype);

            me.setWidget('pveBusSelector', targetValues.busType);
            me.setWidget('pveNetworkCardSelector', targetValues.networkCard);
            me.setWidget('CPUModelSelector', targetValues.cputype);
            var scsihw = targetValues.scsihw || '__default__';
            this.getViewModel().set('current.scsihw', scsihw);
            this.getViewModel().set('current.ostype', ostype);
            me.updateAutoinstall();
        },
        updateAutoinstall: function () {
            let me = this;
            if (!me.getView().insideWizard) {
                return;
            }
            let ostype = me.lookup('ostype').getValue();
            let isWindows = PVE.Utils.is_windows(ostype);
            let supported = /^(?:l26|win7|win8|win10|win11)$/.test(ostype);

            let autoinstall = me.lookup('autoinstall');
            if (!supported) {
                autoinstall.setValue(false);
            }
            autoinstall.setHidden(!supported);

            let enabled = supported && !!autoinstall.getValue();
            let show = (reference, visible) => {
                let field = me.lookup(reference);
                field.setHidden(!visible);
                field.setDisabled(!visible);
            };
            show('autoinstallType', enabled && !isWindows);
            show('autoinstallUser', enabled);
            show('autoinstallPassword', enabled);
            show('autoinstallPasswordConfirm', enabled);
            show('autoinstallTimezone', enabled);
            show('autoinstallEdition', enabled && isWindows);
            show('autoinstallProductKey', enabled && isWindows);

            // the VirtIO drivers are added to the unattended installation
            let enableSecondCD = me.lookup('enableSecondCD');
            if (enabled) {
                enableSecondCD.setValue(false);
            }
            enableSecondCD.setHidden(enabled || !isWindows);
        },
        setWidget: function (widget, newValue) {
            // changing a widget is safe only if ComponentQuery.query returns us
            // a single value array
            var widgets = Ext.ComponentQuery.query('pveQemuCreateWizard ' + widget);
            if (widgets.length === 1) {
                widgets[0].setValue(newValue);
            } else {
                // ignore multiple disks, we only want to set the type if there is a single disk
            }
        },
        onSecondCDChange: function (widget, value, lastValue) {
            let me = this;
            let vm = me.getViewModel();
            let updateVMConfig = function () {
                let widgets = Ext.ComponentQuery.query('pveMultiHDPanel');
                if (widgets.length === 1) {
                    widgets[0].getController().updateVMConfig();
                }
            };
            if (value) {
                // only for windows
                vm.set('current.ide0', 'some');
                vm.notify();
                updateVMConfig();
                me.setWidget('pveBusSelector', 'scsi');
                me.setWidget('pveNetworkCardSelector', 'virtio');
            } else {
                vm.set('current.ide0', '');
                vm.notify();
                updateVMConfig();
                me.setWidget('pveBusSelector', 'scsi');
                let ostype = me.lookup('ostype').getValue();
                let targetValues = PVE.qemu.OSDefaults.getDefaults(ostype);
                me.setWidget('pveBusSelector', targetValues.busType);
            }
        },
    },

    setNodename: function (nodename) {
        var me = this;
        me.lookup('isoSelector').setNodename(nodename);
    },

    onGetValues: function (values) {
        if (values.ide0) {
            let drive = {
                media: 'cdrom',
                file: values.ide0,
            };
            values.ide0 = PVE.Parser.printQemuDrive(drive);
        }
        if (values.autoinstall_enabled) {
            let autoinstall = { enabled: 1 };
            if (values.autoinstall_type) {
                autoinstall.type = values.autoinstall_type;
            }
            if (values.autoinstall_timezone) {
                autoinstall.timezone = values.autoinstall_timezone;
            }
            if (values.autoinstall_edition) {
                autoinstall.edition = values.autoinstall_edition.trim();
            }
            if (values.autoinstall_productkey) {
                autoinstall.productkey = values.autoinstall_productkey.trim();
            }
            values.autoinstall = PVE.Parser.printPropertyString(autoinstall, 'enabled');
        }
        delete values.autoinstall_enabled;
        delete values.autoinstall_type;
        delete values.autoinstall_timezone;
        delete values.autoinstall_edition;
        delete values.autoinstall_productkey;
        return values;
    },

    initComponent: function () {
        var me = this;

        me.items = [
            {
                xtype: 'displayfield',
                value: gettext('Guest OS') + ':',
                hidden: !me.insideWizard,
            },
            {
                xtype: 'combobox',
                submitValue: false,
                name: 'osbase',
                fieldLabel: gettext('Type'),
                editable: false,
                queryMode: 'local',
                value: 'Linux',
                store: Object.keys(PVE.Utils.kvm_ostypes),
            },
            {
                xtype: 'combobox',
                name: 'ostype',
                reference: 'ostype',
                fieldLabel: gettext('Version'),
                value: 'l26',
                allowBlank: false,
                editable: false,
                queryMode: 'local',
                valueField: 'val',
                displayField: 'desc',
                store: {
                    fields: ['desc', 'val'],
                    data: PVE.Utils.kvm_ostypes.Linux,
                    listeners: {
                        datachanged: function (store) {
                            var ostype = me.lookup('ostype');
                            var old_val = ostype.getValue();
                            if (!me.insideWizard && old_val && store.find('val', old_val) !== -1) {
                                ostype.setValue(old_val);
                            } else {
                                ostype.setValue(store.getAt(0));
                            }
                        },
                    },
                },
            },
        ];

        if (me.insideWizard) {
            me.items.push(
                {
                    xtype: 'proxmoxcheckbox',
                    reference: 'enableSecondCD',
                    isFormField: false,
                    hidden: true,
                    checked: false,
                    boxLabel: gettext('Add additional drive for VirtIO drivers'),
                    listeners: {
                        change: function (cb, value) {
                            me.lookup('isoSelector').setDisabled(!value);
                            me.lookup('isoSelector').setHidden(!value);
                        },
                    },
                },
                {
                    xtype: 'pveIsoSelector',
                    reference: 'isoSelector',
                    name: 'ide0',
                    nodename: me.nodename,
                    insideWizard: true,
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'proxmoxcheckbox',
                    reference: 'autoinstall',
                    name: 'autoinstall_enabled',
                    checked: false,
                    boxLabel: gettext('Unattended installation'),
                },
                {
                    xtype: 'proxmoxKVComboBox',
                    reference: 'autoinstallType',
                    name: 'autoinstall_type',
                    fieldLabel: gettext('Installer'),
                    value: 'kickstart',
                    comboItems: [
                        ['kickstart', 'Kickstart'],
                        ['ubuntu', 'Ubuntu'],
                    ],
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'textfield',
                    reference: 'autoinstallUser',
                    name: 'ciuser',
                    fieldLabel: gettext('User'),
                    allowBlank: false,
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'textfield',
                    reference: 'autoinstallPassword',
                    name: 'cipassword',
                    inputType: 'password',
                    value: '',
                    fieldLabel: gettext('Password'),
                    allowBlank: false,
                    minLength: 5,
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'textfield',
                    reference: 'autoinstallPasswordConfirm',
                    name: 'autoinstall_password_confirm',
                    inputType: 'password',
                    value: '',
                    fieldLabel: gettext('Confirm password'),
                    allowBlank: true,
                    submitValue: false,
                    hidden: true,
                    disabled: true,
                    validator: function (value) {
                        let password = me.lookup('autoinstallPassword').getValue();
                        return value === password ? true : gettext('Passwords do not match');
                    },
                },
                {
                    xtype: 'combo',
                    name: 'autoinstall_timezone',
                    reference: 'autoinstallTimezone',
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
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'textfield',
                    reference: 'autoinstallEdition',
                    name: 'autoinstall_edition',
                    fieldLabel: gettext('Edition'),
                    emptyText: Proxmox.Utils.defaultText,
                    hidden: true,
                    disabled: true,
                },
                {
                    xtype: 'textfield',
                    reference: 'autoinstallProductKey',
                    name: 'autoinstall_productkey',
                    fieldLabel: gettext('Product Key'),
                    emptyText: Proxmox.Utils.noneText,
                    regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
                    hidden: true,
                    disabled: true,
                },
            );
        }

        me.callParent();
    },
});

Ext.define('PVE.qemu.OSTypeEdit', {
    extend: 'Proxmox.window.Edit',

    subject: 'OS Type',

    items: [{ xtype: 'pveQemuOSTypePanel' }],

    initComponent: function () {
        var me = this;

        me.callParent();

        me.load({
            success: function (response, options) {
                var value = response.result.data.ostype || 'other';
                var osinfo = PVE.Utils.get_kvm_osinfo(value);
                me.setValues({ ostype: value, osbase: osinfo.base });
            },
        });
    },
});
