Ext.define('PVE.node.SubscriptionKeyEdit', {
    extend: 'Proxmox.window.Edit',

    title: gettext('Upload Subscription Key'),
    width: 350,

    items: {
        xtype: 'textfield',
        name: 'key',
        value: '',
        fieldLabel: gettext('Subscription Key'),
        labelWidth: 120,
        getSubmitValue: function () {
            return this.processRawValue(this.getRawValue())?.trim();
        },
    },

    initComponent: function () {
        var me = this;

        me.callParent();

        me.load();
    },
});

Ext.define('PVE.node.Subscription', {
    extend: 'Proxmox.grid.ObjectGrid',

    alias: ['widget.pveNodeSubscription'],

    onlineHelp: 'getting_help',

    viewConfig: {
        enableTextSelection: true,
    },

    showReport: function () {
        var me = this;

        Proxmox.Utils.API2Request({
            url: '/nodes/' + me.nodename + '/report',
            method: 'POST',
            waitMsgTarget: me,
            failure: function (response) {
                Ext.Msg.alert(gettext('Error'), response.htmlStatus);
            },
            success: function (response) {
                let upid = response.result.data;
                Ext.create('Proxmox.window.TaskProgress', {
                    autoShow: true,
                    upid: upid,
                    taskDone: function (success) {
                        if (success) {
                            Proxmox.Utils.downloadAsFile(
                                `/api2/json/nodes/${me.nodename}/report?upid=${encodeURIComponent(upid)}`,
                            );
                        }
                    },
                });
            },
        });
    },

    initComponent: function () {
        var me = this;

        if (!me.nodename) {
            throw 'no node name specified';
        }

        let rows = {
            productname: {
                header: gettext('Type'),
            },
            key: {
                header: gettext('Subscription Key'),
            },
            status: {
                header: gettext('Status'),
                renderer: (v) => {
                    let message = me.getObjectValue('message');
                    return message ? `${v}: ${message}` : v;
                },
            },
            message: {
                visible: false,
            },
            serverid: {
                header: gettext('Server ID'),
            },
            sockets: {
                header: gettext('Sockets'),
            },
            checktime: {
                header: gettext('Last checked'),
                renderer: Proxmox.Utils.render_timestamp,
            },
            nextduedate: {
                header: gettext('Next due date'),
            },
            signature: {
                header: gettext('Signed/Offline'),
                renderer: (v) => (v ? gettext('Yes') : gettext('No')),
            },
        };

        Ext.apply(me, {
            url: `/api2/json/nodes/${me.nodename}/subscription`,
            cwidth1: 170,
            tbar: [
                {
                    text: gettext('Upload Subscription Key'),
                    handler: () =>
                        Ext.create('PVE.node.SubscriptionKeyEdit', {
                            autoShow: true,
                            url: `/api2/extjs/nodes/${me.nodename}/subscription`,
                            listeners: {
                                destroy: () => me.rstore.load(),
                            },
                        }),
                },
                {
                    text: gettext('Check'),
                    handler: () =>
                        Proxmox.Utils.API2Request({
                            params: { force: 1 },
                            url: `/nodes/${me.nodename}/subscription`,
                            method: 'POST',
                            waitMsgTarget: me,
                            failure: (response) =>
                                Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                            callback: () => me.rstore.load(),
                        }),
                },
                {
                    text: gettext('Remove Subscription'),
                    xtype: 'proxmoxStdRemoveButton',
                    confirmMsg: gettext('Are you sure you want to remove the subscription key?'),
                    baseurl: `/nodes/${me.nodename}/subscription`,
                    dangerous: true,
                    selModel: false,
                    callback: () => me.rstore.load(),
                },
                '-',
                {
                    text: gettext('System Report'),
                    handler: function () {
                        Proxmox.Utils.checked_command(function () {
                            me.showReport();
                        });
                    },
                },
            ],
            rows: rows,
            listeners: {
                activate: () => me.rstore.load(),
            },
        });

        me.callParent();
    },
});
