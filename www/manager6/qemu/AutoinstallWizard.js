// unattended installation in the create wizard, part of the advanced options of the OS tab
Ext.define('PVE.qemu.AutoinstallWizardPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveQemuAutoinstallWizardPanel',

    onlineHelp: 'qm_cloud_init',

    controller: {
        xclass: 'Ext.app.ViewController',

        control: {
            'checkbox[reference=enabled]': {
                change: 'update',
            },
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
            for (const name of ['osbase', 'ostype']) {
                wizard.down(`pveQemuOSTypePanel field[name=${name}]`).on('change', me.update, me);
            }
            wizard.down('field[name=arch]')?.on('change', me.updateArchWarning, me);

            me.onIsoChange(iso, iso.getValue());
            me.update();
        },

        // the unattended installation is only used with the advanced options shown
        isEnabled: function () {
            let enabled = this.lookup('enabled');
            return (
                !!this.getView().advancedVisible && !enabled.isDisabled() && !!enabled.getValue()
            );
        },

        ostype: function () {
            return this.wizard.down('pveQemuOSTypePanel field[name=ostype]').getValue();
        },

        onIsoChange: function (field, value) {
            let me = this;
            let view = me.getView();

            // the file selector may return an array, which is empty without selection
            let volid = Ext.isArray(value) ? value[0] : value;
            if (typeof volid !== 'string' || !volid.includes(':')) {
                volid = undefined;
            }
            if (volid === me.isoVolid && me.isoVolid !== undefined) {
                return;
            }

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

            // without a detected installer, the user has to select it, a wrong installation file
            // is silently ignored by the installer
            let installer = ['kickstart', 'ubuntu'].includes(info.installer)
                ? info.installer
                : null;
            me.lookup('type').setValue(installer);

            // offer the images of the ISO, or the editions matching the selected Windows version
            let edition = me.lookup('edition');
            let images = info.images ?? [];
            // the property string cannot hold ',', ';' or '=', select those by index
            let names = images.map((image) =>
                /[,;=]/.test(image.name) ? `${image.index}` : image.name,
            );
            me.editionOstype = undefined;
            if (names.length) {
                edition.setStore(names);
            }
            edition.setValue(names[0] ?? '');

            me.update();
        },

        onStorageChange: function (field, value) {
            this.lookup('file').setStorage(value);
        },

        update: function () {
            let me = this;
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
            let enabledField = me.lookup('enabled');
            if (!supported) {
                enabledField.setValue(false);
            }
            enabledField.setDisabled(!supported);
            me.lookup('unsupportedHint').setHidden(supported);

            let enabled = me.isEnabled();
            let custom = enabled && !!me.lookup('useCustom').getValue();
            let join = enabled && isWindows && !!me.lookup('join').getValue();

            let show = (reference, visible) => {
                let field = me.lookup(reference);
                field.setHidden(!visible);
                field.setDisabled(!visible);
            };
            show('type', enabled && !isWindows);
            let detected = ['kickstart', 'ubuntu'].includes(info?.installer);
            me.lookup('typeHint').setHidden(!enabled || isWindows || detected);
            show('user', enabled);
            show('password', enabled);
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

    setAdvancedVisible: function (visible) {
        let me = this;
        me.callParent([visible]);
        me.advancedVisible = visible;
        me.getController().update();
    },

    setNodename: function (nodename) {
        let me = this;
        me.nodename = nodename;
        me.lookup('storage').setNodename(nodename);
        me.lookup('file').setStorage(undefined, nodename);
    },

    onGetValues: function (values) {
        if (!this.getController().isEnabled()) {
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

    // everything is an advanced option, the regular part of the panel stays empty
    items: [],

    advancedColumn1: [
        {
            xtype: 'proxmoxcheckbox',
            labelWidth: 140,
            reference: 'enabled',
            isFormField: false,
            fieldLabel: gettext('Unattended Install'),
        },
        {
            xtype: 'displayfield',
            reference: 'unsupportedHint',
            submitValue: false,
            hidden: true,
            value: gettext('Not supported for the selected ISO or guest OS.'),
        },
        {
            xtype: 'proxmoxKVComboBox',
            labelWidth: 140,
            reference: 'type',
            name: 'autoinstall_type',
            fieldLabel: gettext('Installer'),
            allowBlank: false,
            emptyText: gettext('Select the installer of the ISO'),
            comboItems: [
                ['kickstart', 'Kickstart'],
                ['ubuntu', 'Ubuntu'],
            ],
        },
        {
            xtype: 'displayfield',
            reference: 'typeHint',
            submitValue: false,
            hidden: true,
            value: gettext(
                'The installer could not be detected from the ISO, make sure it matches the ISO.',
            ),
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'user',
            name: 'ciuser',
            fieldLabel: gettext('User'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'password',
            name: 'cipassword',
            inputType: 'password',
            fieldLabel: gettext('Password'),
            allowBlank: false,
            minLength: 5,
        },
        {
            xtype: 'combobox',
            labelWidth: 140,
            reference: 'edition',
            name: 'autoinstall_edition',
            fieldLabel: gettext('Edition'),
            queryMode: 'local',
            store: [],
            editable: true,
            forceSelection: false,
            anyMatch: true,
            emptyText: Proxmox.Utils.defaultText,
            // the property string cannot hold these, select such images by index
            regex: /^[^,;=]*$/,
            regexText: gettext("Use the image index for names with ',', ';' or '='"),
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'productkey',
            name: 'autoinstall_productkey',
            fieldLabel: gettext('Product Key'),
            emptyText: Proxmox.Utils.noneText,
            regex: /^[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}$/,
        },
        {
            xtype: 'proxmoxcheckbox',
            labelWidth: 140,
            reference: 'rdp',
            name: 'autoinstall_rdp',
            fieldLabel: gettext('Remote Desktop'),
        },
        {
            xtype: 'proxmoxcheckbox',
            labelWidth: 140,
            reference: 'join',
            isFormField: false,
            fieldLabel: gettext('Join Domain'),
        },
    ],

    advancedColumn2: [
        {
            xtype: 'combo',
            labelWidth: 140,
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
            labelWidth: 140,
            reference: 'useCustom',
            isFormField: false,
            fieldLabel: gettext('Custom File'),
        },
        {
            xtype: 'pveStorageSelector',
            labelWidth: 140,
            reference: 'storage',
            isFormField: false,
            fieldLabel: gettext('Storage'),
            storageContent: 'snippets',
            autoSelect: true,
        },
        {
            xtype: 'pveFileSelector',
            labelWidth: 140,
            reference: 'file',
            name: 'autoinstall_file',
            fieldLabel: gettext('Snippet'),
            storageContent: 'snippets',
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'domain',
            name: 'cidomain',
            fieldLabel: gettext('Domain'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'domainUser',
            name: 'cidomainuser',
            fieldLabel: gettext('Domain User'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'domainPassword',
            name: 'cidomainpassword',
            inputType: 'password',
            fieldLabel: gettext('Domain Password'),
            allowBlank: false,
        },
        {
            xtype: 'textfield',
            labelWidth: 140,
            reference: 'domainOU',
            name: 'cidomainou',
            fieldLabel: 'OU',
            emptyText: Proxmox.Utils.defaultText,
        },
    ],

    initComponent: function () {
        let me = this;
        me.callParent();
        // the fields are shown once the unattended installation is enabled
        me.query('field:not(displayfield):not([reference=enabled])').forEach((field) => {
            field.setHidden(true);
            field.setDisabled(true);
        });
    },
});
