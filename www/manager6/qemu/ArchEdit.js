Ext.define('PVE.qemu.ArchEdit', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveQemuArchEdit',

    subject: 'ARCH',
    autoLoad: true,

    items: {
    xtype: 'proxmoxKVComboBox',
	name: 'arch',
	fieldLabel: gettext('Arch'),
	comboItems: [
	    ['__default__', PVE.Utils.render_get_arch()],
	    ['x86_64', 'x86_64'],
        ['riscv64', 'riscv64'],
        ['loongarch64', 'loongarch64'],
        ['aarch64', 'aarch64'],
	],
	bind: {
	    value: '{arch}',
	},
    },
});
