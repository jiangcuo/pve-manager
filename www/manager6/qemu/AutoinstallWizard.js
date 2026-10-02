// unattended installation in the create wizard, the fields are shown as advanced options
Ext.define('PVE.qemu.AutoinstallWizardPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuAutoinstallWizardPanel',

    onlineHelp: 'qm_cloud_init',

    controller: {
        xclass: 'Ext.app.ViewController',

        control: {
            'field[name=autoinstall_type]': {
                change: 'update',
            },
            'checkbox[reference=useCustom]': {
                change: 'update',
            },
            'checkbox[reference=join]': {
                change: 'update',
            },
            'pveStorageSelector[reference=storage]': {
                change: 'onStorageChange',
            },
        },

        init: function (view) {
            let me = this;
            // the ISO, the guest OS and the architecture are selected in other panels
            view.on('afterrender', () => me.connect(), me, { single: true });
        },

        connect: function () {
            let me = this;
            let wizard = me.getView().up('window');
            me.wizard = wizard;

            let iso = wizard.down('pveQemuCDInputPanel pveIsoSelector');
            iso.on('change', me.onIsoChange, me);
            me.enabledField().on('change', me.onEnabledChange, me);
            for (const name of ['osbase', 'ostype']) {
                wizard.down(`pveQemuOSTypePanel field[name=${name}]`).on('change', me.update, me);
            }
            wizard.down('field[name=arch]')?.on('change', me.updateArchWarning, me);

            if (iso.getValue()) {
                me.onIsoChange(iso, iso.getValue());
            }
            me.update();
        },

        enabledField: function () {
            return this.wizard.down('pveQemuCDInputPanel field[name=autoinstall_enabled]');
        },

        ostype: function () {
            return this.wizard.down('pveQemuOSTypePanel field[name=ostype]').getValue();
        },

        onIsoChange: function (field, volid) {
            let me = this;
            let view = me.getView();

            me.isoInfo = undefined;
            me.isoVolid = volid;
            me.applyIsoInfo();
            if (!volid) {
                return;
            }

            Proxmox.Utils.API2Request({
                url: `/nodes/${view.nodename}/storage/${volid.split(':')[0]}/iso-info`,
                method: 'GET',
                params: { volume: volid },
                success: function (response) {
                    if (me.isoVolid !== volid || view.destroyed) {
                        return;
                    }
                    me.isoInfo = response.result.data;
                    me.applyIsoInfo();
                },
                failure: () => {
                    // detection is optional, e.g. pxvirt-isoinfo is not installed
                },
            });
        },

        applyIsoInfo: function () {
            let me = this;
            let info = me.isoInfo ?? {};

            let ostype = info.ostype;
            let osbase = Object.keys(PVE.Utils.kvm_ostypes).find((base) =>
                PVE.Utils.kvm_ostypes[base].some((t) => t.val === ostype),
            );
            if (osbase) {
                let osPanel = me.wizard.down('pveQemuOSTypePanel');
                osPanel.down('field[name=osbase]').setValue(osbase);
                osPanel.down('field[name=ostype]').setValue(ostype);
            }

            if (info.installer === 'kickstart' || info.installer === 'ubuntu') {
                me.lookup('type').setValue(info.installer);
            }

            // offer the images of the ISO, or the editions matching the selected Windows version
            let edition = me.lookup('edition');
            let images = info.images ?? [];
            // the property string cannot hold ',' or '=', select those by index
            let names = images.map((image) =>
                /[,=]/.test(image.name) ? `${image.index}` : image.name,
            );
            me.editionOstype = undefined;
            if (names.length) {
                edition.setStore(names);
            }
            edition.setValue(names[0] ?? '');

            me.update();
        },

        onEnabledChange: function (field, value) {
            let me = this;
            if (value) {
                // the unattended installation options are advanced options
                let toolbar = me.wizard.getDockedItems('toolbar[dock="bottom"]')[0];
                let advanced = toolbar?.down('proxmoxcheckbox');
                if (advanced && !advanced.getValue()) {
                    advanced.setValue(true);
                }
            }
            me.update();
        },

        onStorageChange: function (field, value) {
            this.lookup('file').setStorage(value);
        },

        update: function () {
            let me = this;
            let view = me.getView();
            if (!me.wizard) {
                return;
            }
            let ostype = me.ostype();
            let isWindows = PVE.Utils.is_windows(ostype);
            let info = me.isoInfo;

            // without images from the ISO, offer the editions of the selected Windows version
            if (!info?.images?.length && me.editionOstype !== ostype) {
                me.editionOstype = ostype;
                me.lookup('edition').setStore(PVE.Utils.windows_editions(ostype));
            }

            let supported = /^(?:l26|win7|win8|win10|win11)$/.test(ostype);
            if (info && info.type !== 'unknown' && !info.installer) {
                supported = false; // detected an OS without unattended installation support
            }
            let enabledField = me.enabledField();
            if (!supported) {
                enabledField.setValue(false);
            }
            enabledField.setHidden(!supported);

            let enabled = supported && !!enabledField.getValue();
            let custom = enabled && !!me.lookup('useCustom').getValue();
            let join = enabled && isWindows && !!me.lookup('join').getValue();

            view.setHidden(!enabled);
            let show = (reference, visible) => {
                let field = me.lookup(reference);
                field.setHidden(!visible);
                field.setDisabled(!visible);
            };
            show('type', enabled && !isWindows);
            show('user', enabled);
            show('password', enabled);
            show('passwordConfirm', enabled);
            show('timezone', enabled);
            show('useCustom', enabled);
            show('storage', custom);
            show('file', custom);
            show('edition', enabled && isWindows);
            show('productkey', enabled && isWindows);
            show('rdp', enabled && isWindows);
            show('join', enabled && isWindows);
            show('domain', join);
            show('domainUser', join);
            show('domainPassword', join);
            show('domainOU', join);

            // the VirtIO drivers are added to the unattended installation
            let secondCD = me.wizard.down('pveQemuOSTypePanel checkbox[reference=enableSecondCD]');
            if (enabled) {
                secondCD.setValue(false);
            }
            secondCD.setHidden(enabled || !isWindows);

            me.updateArchWarning();
        },

        // warn if the ISO cannot boot natively, emulating another architecture is still possible
        updateArchWarning: function () {
            let me = this;
            let isoArch = me.isoInfo?.arch;
            let vmArch = me.wizard.down('field[name=arch]')?.getValue();
            if (!vmArch || vmArch === '__default__') {
                let node = PVE.data.ResourceStore.getNodeById(me.getView().nodename);
                vmArch = node?.data?.arch;
            }
            let compatible = {
                x86_64: ['x86_64', 'i686'],
            };
            let mismatch =
                isoArch &&
                vmArch &&
                isoArch !== vmArch &&
                !(compatible[vmArch] ?? []).includes(isoArch);

            me.archWarning = mismatch
                ? Ext.String.format(
                      gettext(
                          'ISO architecture ({0}) does not match the VM architecture ({1}), the VM may not boot.',
                      ),
                      isoArch,
                      vmArch,
                  )
                : undefined;

            let field = me.wizard.down('pveQemuCDInputPanel displayfield[name=archWarning]');
            field.setValue(
                mismatch
                    ? `<i class="fa fa-exclamation-triangle warning"></i> ${Ext.htmlEncode(me.archWarning)}`
                    : '',
            );
            field.setHidden(!mismatch);
        },
    },

    setNodename: function (nodename) {
        let me = this;
        me.nodename = nodename;
        me.lookup('storage').setNodename(nodename);
        me.lookup('file').setStorage(undefined, nodename);
    },

    onGetValues: function (values) {
        if (!this.getController().enabledField()?.getValue()) {
            return {};
        }

        let autoinstall = { enabled: 1 };
        if (values.autoinstall_type) {
            autoinstall.type = values.autoinstall_type;
        }
        if (values.autoinstall_file) {
            autoinstall.file = values.autoinstall_file;
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
        if (values.autoinstall_rdp) {
            autoinstall.rdp = 1;
        }

        let params = {
            autoinstall: PVE.Parser.printPropertyString(autoinstall, 'enabled'),
        };
        for (const key of [
            'ciuser',
            'cipassword',
            'cidomain',
            'cidomainuser',
            'cidomainpassword',
        ]) {
            if (values[key]) {
                params[key] = values[key];
            }
        }
        if (values.cidomainou?.trim()) {
            params.cidomainou = values.cidomainou.trim();
        }
        return params;
    },

    // all options are advanced options
    column1: [],

    advancedColumn1: [
        {
            xtype: 'proxmoxKVComboBox',
            reference: 'type',
            name: 'autoinstall_type',
            fieldLabel: gettext('Installer'),
            value: 'kickstart',
            comboItems: [
                ['kickstart', 'Kickstart'],
                ['ubuntu', 'Ubuntu'],
            ],
        },
        {
            xtype: 'textfield',
            reference: 'user',
            name: 'ciuser',
            fieldLabel: gettext('User'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            reference: 'password',
            name: 'cipassword',
            inputType: 'password',
            fieldLabel: gettext('Password'),
            allowBlank: false,
            minLength: 5,
        },
        {
            xtype: 'textfield',
            reference: 'passwordConfirm',
            inputType: 'password',
            fieldLabel: gettext('Confirm password'),
            submitValue: false,
            validator: function (value) {
                let password = this.up('inputpanel').lookup('password').getValue();
                return value === password ? true : gettext('Passwords do not match');
            },
        },
        {
            xtype: 'combo',
            reference: 'timezone',
            name: 'autoinstall_timezone',
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
            xtype: 'proxmoxcheckbox',
            reference: 'useCustom',
            isFormField: false,
            fieldLabel: gettext('Custom File'),
        },
        {
            xtype: 'pveStorageSelector',
            reference: 'storage',
            isFormField: false,
            fieldLabel: gettext('Storage'),
            storageContent: 'snippets',
            autoSelect: true,
        },
        {
            xtype: 'pveFileSelector',
            reference: 'file',
            name: 'autoinstall_file',
            fieldLabel: gettext('Snippet'),
            storageContent: 'snippets',
        },
    ],

    advancedColumn2: [
        {
            xtype: 'combobox',
            reference: 'edition',
            name: 'autoinstall_edition',
            fieldLabel: gettext('Edition'),
            queryMode: 'local',
            store: [],
            editable: true,
            forceSelection: false,
            anyMatch: true,
            emptyText: Proxmox.Utils.defaultText,
        },
        {
            xtype: 'textfield',
            reference: 'productkey',
            name: 'autoinstall_productkey',
            fieldLabel: gettext('Product Key'),
            emptyText: Proxmox.Utils.noneText,
            regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
        },
        {
            xtype: 'proxmoxcheckbox',
            reference: 'rdp',
            name: 'autoinstall_rdp',
            fieldLabel: gettext('Remote Desktop'),
        },
        {
            xtype: 'proxmoxcheckbox',
            reference: 'join',
            isFormField: false,
            fieldLabel: gettext('Join Domain'),
        },
        {
            xtype: 'textfield',
            reference: 'domain',
            name: 'cidomain',
            fieldLabel: gettext('Domain'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            reference: 'domainUser',
            name: 'cidomainuser',
            fieldLabel: gettext('Domain User'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            reference: 'domainPassword',
            name: 'cidomainpassword',
            inputType: 'password',
            fieldLabel: gettext('Domain Password'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            reference: 'domainOU',
            name: 'cidomainou',
            fieldLabel: 'OU',
            emptyText: Proxmox.Utils.defaultText,
        },
    ],

    initComponent: function () {
        let me = this;
        me.callParent();
        // everything is shown once the unattended installation is enabled
        me.query('field').forEach((field) => {
            field.setHidden(true);
            field.setDisabled(true);
        });
        me.setHidden(true);
    },
});
