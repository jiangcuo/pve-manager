include ../../defines.mk

BIOME ?= proxmox-biome

JSSRC= 							\
	Parser.js					\
	StateProvider.js				\
	Utils.js					\
	UIOptions.js					\
	Toolkit.js					\
	VNCConsole.js					\
	button/ConsoleButton.js				\
	button/Revert.js				\
	button/Split.js					\
	controller/StorageEdit.js			\
	data/PermPathStore.js				\
	data/ResourceStore.js				\
	data/model/RRDModels.js				\
	container/TwoColumnContainer.js			\
	form/ACMEAPISelector.js 			\
	form/ACMEAccountSelector.js			\
	form/ACMEPluginSelector.js			\
	form/AgentFeatureSelector.js			\
	form/BackupCompressionSelector.js		\
	form/BackupModeSelector.js			\
	form/BandwidthSelector.js			\
	form/BridgeSelector.js				\
	form/BusTypeSelector.js				\
	form/CPUModelSelector.js			\
	form/CacheTypeSelector.js			\
	form/CalendarEvent.js				\
	form/CephPoolSelector.js			\
	form/CephFSSelector.js				\
	form/ComboBoxSetStoreNode.js			\
	form/ContentTypeSelector.js			\
	form/ControllerSelector.js			\
	form/DayOfWeekSelector.js			\
	form/DirMapSelector.js                          \
	form/DiskFormatSelector.js			\
	form/DiskStorageSelector.js			\
	form/FileSelector.js				\
	form/FirewallPolicySelector.js			\
	form/GlobalSearchField.js			\
	form/GroupSelector.js				\
	form/GuestIDSelector.js				\
	form/HashAlgorithmSelector.js			\
	form/HotplugFeatureSelector.js			\
	form/IPProtocolSelector.js			\
	form/IPRefSelector.js				\
	form/MDevSelector.js				\
	form/MemoryField.js				\
	form/MultiPCISelector.js			\
	form/NetworkCardSelector.js			\
	form/NodeSelector.js				\
	form/NotificationModeSelector.js		\
	form/NotificationTargetSelector.js		\
	form/NotificationPolicySelector.js		\
	form/PCISelector.js				\
	form/PCIMapSelector.js				\
	form/PermPathSelector.js			\
	form/PoolSelector.js				\
	form/PreallocationSelector.js			\
	form/PrivilegesSelector.js			\
	form/QemuBiosSelector.js			\
	form/SDNControllerSelector.js			\
	form/SDNZoneSelector.js				\
	form/SDNVnetSelector.js				\
	form/SDNIpamSelector.js				\
	form/SDNDnsSelector.js				\
	form/ScsiHwSelector.js				\
	form/SecurityGroupSelector.js			\
	form/SnapshotSelector.js			\
	form/SpiceEnhancementSelector.js		\
	form/StorageScanNodeSelector.js	    		\
	form/StorageSelector.js				\
	form/TFASelector.js				\
	form/TokenSelector.js 				\
	form/USBSelector.js				\
	form/USBMapSelector.js				\
	form/UserSelector.js				\
	form/VLanField.js				\
	form/VMCPUFlagSelector.js			\
	form/VMSelector.js				\
	form/VNCKeyboardSelector.js			\
	form/ViewSelector.js				\
	form/iScsiProviderSelector.js			\
	form/TagColorGrid.js				\
	form/ListField.js				\
	form/Tag.js					\
	form/TagEdit.js					\
	form/MultiFileButton.js				\
	form/TagFieldSet.js				\
	form/IsoSelector.js				\
	grid/BackupView.js				\
	grid/FirewallAliases.js				\
	grid/FirewallOptions.js				\
	grid/FirewallRules.js				\
	grid/PoolMembers.js				\
	grid/Replication.js				\
	grid/ResourceGrid.js				\
	panel/ConfigPanel.js				\
	panel/BackupAdvancedOptions.js			\
	panel/BackupNotificationOptions.js		\
	panel/BackupJobPrune.js				\
	panel/HealthWidget.js				\
	panel/IPSet.js					\
	panel/RunningChart.js				\
	panel/StatusPanel.js				\
	panel/GuestStatusView.js			\
	panel/GuestSummary.js				\
	panel/TemplateStatusView.js			\
	panel/MultiDiskEdit.js				\
	panel/TagConfig.js				\
	tree/ResourceTree.js				\
	tree/SnapshotTree.js				\
	tree/ResourceMapTree.js				\
	tree/DhcpTree.js				\
	window/Backup.js				\
	window/BackupConfig.js				\
	window/BulkAction.js				\
	window/CephInstall.js				\
	window/Clone.js					\
	window/FirewallEnableEdit.js			\
	window/FirewallLograteEdit.js			\
	window/LoginWindow.js				\
	window/Migrate.js				\
	window/Prune.js					\
	window/Restore.js				\
	window/SafeDestroyGuest.js			\
	window/SafeDestroyStorage.js			\
	window/Settings.js				\
	window/Snapshot.js				\
	window/StartupEdit.js				\
	window/DownloadUrlToStorage.js 			\
	window/UploadToStorage.js 			\
	window/ScheduleSimulator.js			\
	window/Wizard.js				\
	window/GuestDiskReassign.js				\
	window/GuestStop.js				\
	window/TreeSettingsEdit.js			\
	window/PCIMapEdit.js				\
	window/USBMapEdit.js				\
	window/DirMapEdit.js                            \
	window/GuestImport.js				\
	ha/Fencing.js					\
	ha/ResourceEdit.js				\
	ha/Resources.js					\
	ha/RuleEdit.js					\
	ha/RuleErrorsModal.js				\
	ha/Rules.js					\
	ha/Status.js					\
	ha/StatusView.js				\
	ha/rules/NodeAffinityRuleEdit.js		\
	ha/rules/NodeAffinityRules.js			\
	ha/rules/ResourceAffinityRuleEdit.js		\
	ha/rules/ResourceAffinityRules.js		\
	dc/ACLView.js					\
	dc/ACMEClusterView.js				\
	dc/AuthEditBase.js				\
	dc/AuthEditAD.js				\
	dc/AuthEditLDAP.js				\
	dc/AuthEditOpenId.js				\
	dc/AuthView.js					\
	dc/BackupJobDetail.js				\
	dc/Backup.js					\
	dc/Cluster.js					\
	dc/ClusterEdit.js				\
	dc/Config.js					\
	dc/CorosyncLinkEdit.js				\
	dc/GroupEdit.js					\
	dc/GroupView.js					\
	dc/Guests.js					\
	dc/Health.js					\
	dc/Log.js					\
	dc/NodeView.js					\
	dc/OptionView.js				\
	dc/PermissionView.js				\
	dc/PoolEdit.js					\
	dc/PoolView.js					\
	dc/RoleEdit.js					\
	dc/RoleView.js					\
	dc/SecurityGroups.js				\
	dc/StorageView.js				\
	dc/Summary.js					\
	dc/Support.js					\
	dc/SyncWindow.js				\
	dc/Tasks.js					\
	dc/TokenEdit.js					\
	dc/TokenView.js					\
	dc/UserEdit.js					\
	dc/UserView.js					\
	dc/MetricServerView.js				\
	dc/UserTagAccessEdit.js				\
	dc/RegisteredTagsEdit.js			\
	dc/RealmSyncJob.js				\
	dc/PCIMapView.js				\
	dc/USBMapView.js				\
	dc/DirMapView.js				\
	lxc/CmdMenu.js					\
	lxc/Config.js					\
	lxc/CreateWizard.js				\
	lxc/DeviceEdit.js				\
	lxc/DNS.js					\
	lxc/FeaturesEdit.js				\
	lxc/MPEdit.js					\
	lxc/MPResize.js					\
	lxc/Network.js					\
	lxc/Options.js					\
	lxc/ResourceEdit.js				\
	lxc/Resources.js				\
	lxc/MultiMPEdit.js				\
	menu/MenuItem.js				\
	menu/TemplateMenu.js				\
	ceph/CephInstallWizard.js			\
	ceph/Config.js					\
	ceph/Crush.js					\
	ceph/FS.js					\
	ceph/Log.js					\
	ceph/Monitor.js					\
	ceph/OSD.js					\
	ceph/OSDDetails.js				\
	ceph/Pool.js					\
	ceph/ServiceList.js				\
	ceph/Services.js				\
	ceph/Status.js					\
	ceph/StatusDetail.js				\
	node/ACME.js					\
	node/Certificates.js				\
	node/CmdMenu.js					\
	node/Config.js					\
	node/Directory.js				\
	node/LVM.js					\
	node/LVMThin.js					\
	node/StatusView.js				\
	node/Subscription.js				\
	node/Summary.js					\
	node/ZFS.js					\
	node/NodeOptionsView.js				\
	pool/Config.js					\
	pool/StatusView.js				\
	pool/Summary.js					\
	qemu/AgentIPView.js				\
	qemu/AudioEdit.js				\
	qemu/BootOrderEdit.js				\
	qemu/CDEdit.js					\
	qemu/CIDriveEdit.js				\
	qemu/CloudInit.js				\
	qemu/CmdMenu.js					\
	qemu/Config.js					\
	qemu/CreateWizard.js				\
	qemu/DisplayEdit.js				\
	qemu/HDEdit.js					\
	qemu/HDEfi.js					\
	qemu/HDTPM.js					\
	qemu/HDMove.js					\
	qemu/HDResize.js				\
	qemu/HardwareView.js				\
	qemu/IPConfigEdit.js				\
	qemu/KeyboardEdit.js				\
	qemu/MachineEdit.js				\
	qemu/MemoryEdit.js				\
	qemu/Monitor.js					\
	qemu/MultiHDEdit.js				\
	qemu/NetworkEdit.js				\
	qemu/OSDefaults.js				\
	qemu/OSTypeEdit.js				\
	qemu/Options.js					\
	qemu/PCIEdit.js					\
	qemu/ProcessorEdit.js				\
	qemu/QemuBiosEdit.js				\
	qemu/RNGEdit.js					\
	qemu/SSHKey.js					\
	qemu/ScsiHwEdit.js				\
	qemu/SerialEdit.js				\
	qemu/SevEdit.js					\
	qemu/Smbios1Edit.js				\
	qemu/SystemEdit.js				\
	qemu/USBEdit.js					\
	qemu/VirtiofsEdit.js				\
	sdn/Browser.js					\
	sdn/ControllerView.js				\
	sdn/Status.js					\
	sdn/StatusView.js				\
	sdn/VnetEdit.js					\
	sdn/VnetView.js					\
	sdn/VnetACLView.js					\
	sdn/VnetPanel.js				\
	sdn/SubnetEdit.js				\
	sdn/SubnetView.js				\
	sdn/ZoneContentView.js				\
	sdn/ZoneContentPanel.js				\
	sdn/FirewallPanel.js				\
	sdn/FirewallVnetView.js				\
	sdn/ZoneView.js					\
	sdn/IpamEdit.js					\
	sdn/OptionsPanel.js				\
	sdn/controllers/Base.js				\
	sdn/controllers/EvpnEdit.js			\
	sdn/controllers/BgpEdit.js			\
	sdn/controllers/IsisEdit.js			\
	sdn/IpamView.js					\
	sdn/ipams/Base.js				\
	sdn/ipams/NetboxEdit.js				\
	sdn/ipams/PVEIpamEdit.js			\
	sdn/ipams/PhpIpamEdit.js			\
	sdn/DnsView.js					\
	sdn/dns/Base.js					\
	sdn/dns/PowerdnsEdit.js				\
	sdn/zones/Base.js				\
	sdn/zones/EvpnEdit.js				\
	sdn/zones/QinQEdit.js				\
	sdn/zones/SimpleEdit.js				\
	sdn/zones/VlanEdit.js				\
	sdn/zones/VxlanEdit.js				\
	sdn/FabricsView.js				\
	sdn/fabrics/Common.js				\
	sdn/fabrics/InterfacePanel.js				\
	sdn/fabrics/NodeEdit.js				\
	sdn/fabrics/FabricEdit.js				\
	sdn/fabrics/openfabric/InterfacePanel.js				\
	sdn/fabrics/openfabric/NodeEdit.js				\
	sdn/fabrics/openfabric/FabricEdit.js				\
	sdn/fabrics/ospf/InterfacePanel.js	\
	sdn/fabrics/ospf/NodeEdit.js	\
	sdn/fabrics/ospf/FabricEdit.js	\
	storage/ContentView.js				\
	storage/BackupView.js				\
	storage/Base.js					\
	storage/Browser.js				\
	storage/CIFSEdit.js				\
	storage/CephFSEdit.js				\
	storage/DirEdit.js				\
	storage/ImageView.js				\
	storage/IScsiEdit.js				\
	storage/LVMEdit.js				\
	storage/LvmThinEdit.js				\
	storage/BTRFSEdit.js				\
	storage/NFSEdit.js				\
	storage/PBSEdit.js				\
	storage/RBDEdit.js				\
	storage/StatusView.js				\
	storage/Summary.js				\
	storage/TemplateView.js				\
	storage/ZFSEdit.js				\
	storage/ZFSPoolEdit.js				\
	storage/ESXIEdit.js				\
	Workspace.js					\
# end of JSSRC list

WIDGETKIT=/usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js

all:

.PHONY: tidy
tidy: $(JSSRC)
	proxmox-biome format --fix $?

.lint-incremental: $(JSSRC)
	$(BIOME) lint $?
	touch "$@"

.PHONY: lint
check: lint
lint: $(JSSRC)
	$(BIOME) lint --error-on-warnings $(JSSRC)
	touch ".lint-incremental"

pvemanagerlib.js: .lint-incremental OnlineHelpInfo.js $(JSSRC)
	cat OnlineHelpInfo.js $(JSSRC) >$@.tmp
	mv $@.tmp $@

OnlineHelpInfo.js: ARGS ?= $(if $(ALLOW_MISSING),--allow-missing,)
OnlineHelpInfo.js: $(JSSRC) $(WIDGETKIT)
	/usr/bin/asciidoc-pve scan-extjs $(ARGS) $^ >$@.tmp
	mv $@.tmp $@

.PHONY: install
install: pvemanagerlib.js
	install -d $(WWWJSDIR)
	install -m 0644 pvemanagerlib.js $(WWWJSDIR)

.PHONY: clean
clean:
	rm -rf pvemanagerlib.js OnlineHelpInfo.js .lint-incremental
