Ext.define('PVE.form.ScsiHwSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveScsiHwSelector'],
    comboItems: [
	['__default__', PVE.Utils.render_scsihw('')],
	['virtio-scsi-pci', PVE.Utils.render_scsihw('virtio-scsi-pci')],
	['virtio-scsi-single', PVE.Utils.render_scsihw('virtio-scsi-single')],
    ],
});
