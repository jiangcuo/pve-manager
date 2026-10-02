package PVE::API2::Cluster::Notifications;

use warnings;
use strict;

use Storable qw(dclone);
use JSON;

use PVE::Exception qw(raise_param_exc);
use PVE::Tools qw(extract_param);
use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;
use PVE::Notify;

use base qw(PVE::RESTHandler);

sub make_properties_optional {
    my ($properties) = @_;
    $properties = dclone($properties);

    for my $key (keys %$properties) {
        $properties->{$key}->{optional} = 1 if $key ne 'name';
    }

    return $properties;
}

sub remove_protected_properties {
    my ($properties, $to_remove) = @_;
    $properties = dclone($properties);

    for my $key (keys %$properties) {
        if (grep /^$key$/, @$to_remove) {
            delete $properties->{$key};
        }
    }

    return $properties;
}

sub raise_api_error {
    my ($api_error) = @_;

    if (!(ref($api_error) eq 'HASH' && $api_error->{message} && $api_error->{code})) {
        die $api_error;
    }

    my $msg = "$api_error->{message}\n";
    my $exc = PVE::Exception->new($msg, code => $api_error->{code});

    my (undef, $filename, $line) = caller;

    $exc->{filename} = $filename;
    $exc->{line} = $line;

    die $exc;
}

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => 'Index for notification-related API endpoints.',
    permissions => { user => 'all' },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {},
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $result = [
            { name => 'endpoints' },
            { name => 'matchers' },
            { name => 'targets' },
            { name => 'matcher-fields' },
            { name => 'matcher-field-values' },
        ];

        return $result;
    },
});

__PACKAGE__->register_method({
    name => 'get_matcher_fields',
    path => 'matcher-fields',
    method => 'GET',
    description => 'Returns known notification metadata fields',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 0,
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                name => {
                    description => 'Name of the field.',
                    type => 'string',
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        # TODO: Adapt this API handler once we have a 'notification registry'

        my $result = [
            { name => 'type' }, { name => 'hostname' }, { name => 'job-id' },
        ];

        return $result;
    },
});

__PACKAGE__->register_method({
    name => 'get_matcher_field_values',
    path => 'matcher-field-values',
    method => 'GET',
    description => 'Returns known notification metadata fields and their known values',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                'value' => {
                    description => 'Notification metadata value known by the system.',
                    type => 'string',
                },
                'comment' => {
                    description => 'Additional comment for this value.',
                    type => 'string',
                    optional => 1,
                },
                'field' => {
                    description => 'Field this value belongs to.',
                    type => 'string',
                },
            },
        },
    },
    code => sub {
        # TODO: Adapt this API handler once we have a 'notification registry'
        my $rpcenv = PVE::RPCEnvironment::get();
        my $user = $rpcenv->get_user();

        my $values = [
            {
                value => 'package-updates',
                field => 'type',
            },
            {
                value => 'fencing',
                field => 'type',
            },
            {
                value => 'replication',
                field => 'type',
            },
            {
                value => 'vzdump',
                field => 'type',
            },
            {
                value => 'system-mail',
                field => 'type',
            },
        ];

        # Here we need a manual permission check.
        if ($rpcenv->check($user, "/", ["Sys.Audit"], 1)) {
            for my $backup_job (@{ PVE::API2::Backup->index({}) }) {
                push @$values,
                    {
                        value => $backup_job->{id},
                        comment => $backup_job->{comment},
                        field => 'job-id',
                    };
            }
        }
        # The API call returns only returns jobs for which the user
        # has adequate permissions.
        for my $sync_job (@{ PVE::API2::ReplicationConfig->index({}) }) {
            push @$values,
                {
                    value => $sync_job->{id},
                    comment => $sync_job->{comment},
                    field => 'job-id',
                };
        }

        for my $node (@{ PVE::Cluster::get_nodelist() }) {
            push @$values,
                {
                    value => $node,
                    field => 'hostname',
                };
        }

        return $values;
    },
});

__PACKAGE__->register_method({
    name => 'endpoints_index',
    path => 'endpoints',
    method => 'GET',
    description => 'Index for all available endpoint types.',
    permissions => { user => 'all' },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {},
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $result = [
            { name => 'gotify' },
            { name => 'sendmail' },
            { name => 'smtp' },
            { name => 'webhook' },
            { name => 'dingtalk' },
            { name => 'feishu' },
            { name => 'wecom' },
            { name => 'sms' },
        ];

        return $result;
    },
});

__PACKAGE__->register_method({
    name => 'get_all_targets',
    path => 'targets',
    method => 'GET',
    description => 'Returns a list of all entities that can be used as notification targets.',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
            ['perm', '/mapping/notifications', ['Mapping.Use']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                name => {
                    description => 'Name of the target.',
                    type => 'string',
                    format => 'pve-configid',
                },
                'type' => {
                    description => 'Type of the target.',
                    type => 'string',
                    enum => [qw(sendmail gotify smtp webhook dingtalk feishu wecom sms)],
                },
                'comment' => {
                    description => 'Comment',
                    type => 'string',
                    optional => 1,
                },
                'disable' => {
                    description => 'Show if this target is disabled',
                    type => 'boolean',
                    optional => 1,
                    default => 0,
                },
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();

        my $targets = eval { $config->get_targets(); };

        raise_api_error($@) if $@;

        return $targets;
    },
});

__PACKAGE__->register_method({
    name => 'test_target',
    path => 'targets/{name}/test',
    protected => 1,
    method => 'POST',
    description => 'Send a test notification to a provided target.',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
            ['perm', '/mapping/notifications', ['Mapping.Use']],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                description => 'Name of the target.',
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            my $config = PVE::Notify::read_config();
            $config->test_target($name);
        };

        raise_api_error($@) if $@;

        return;
    },
});

my $sendmail_properties = {
    name => {
        description => 'The name of the endpoint.',
        type => 'string',
        format => 'pve-configid',
    },
    mailto => {
        type => 'array',
        items => {
            type => 'string',
            format => 'email-or-username',
        },
        description => 'List of email recipients',
        optional => 1,
    },
    'mailto-user' => {
        type => 'array',
        items => {
            type => 'string',
            format => 'pve-userid',
        },
        description => 'List of users',
        optional => 1,
    },
    'from-address' => {
        description => '`From` address for the mail',
        type => 'string',
        optional => 1,
    },
    author => {
        description => 'Author of the mail',
        type => 'string',
        optional => 1,
    },
    'comment' => {
        description => 'Comment',
        type => 'string',
        optional => 1,
    },
    'disable' => {
        description => 'Disable this target',
        type => 'boolean',
        optional => 1,
        default => 0,
    },
};

__PACKAGE__->register_method({
    name => 'get_sendmail_endpoints',
    path => 'endpoints/sendmail',
    method => 'GET',
    description => 'Returns a list of all sendmail endpoints',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                %$sendmail_properties,
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();

        my $entities = eval { $config->get_sendmail_endpoints(); };
        raise_api_error($@) if $@;

        return $entities;
    },
});

__PACKAGE__->register_method({
    name => 'get_sendmail_endpoint',
    path => 'endpoints/sendmail/{name}',
    method => 'GET',
    description => 'Return a specific sendmail endpoint',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            %$sendmail_properties, digest => get_standard_option('pve-config-digest'),
        },

    },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        my $config = PVE::Notify::read_config();
        my $endpoint = eval { $config->get_sendmail_endpoint($name) };

        raise_api_error($@) if $@;
        $endpoint->{digest} = $config->digest();

        return $endpoint;
    },
});

__PACKAGE__->register_method({
    name => 'create_sendmail_endpoint',
    path => 'endpoints/sendmail',
    protected => 1,
    method => 'POST',
    description => 'Create a new sendmail endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => $sendmail_properties,
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $mailto = extract_param($param, 'mailto');
        my $mailto_user = extract_param($param, 'mailto-user');
        my $from_address = extract_param($param, 'from-address');
        my $author = extract_param($param, 'author');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->add_sendmail_endpoint(
                    $name, $mailto, $mailto_user, $from_address, $author, $comment, $disable,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_sendmail_endpoint',
    path => 'endpoints/sendmail/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing sendmail endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %{ make_properties_optional($sendmail_properties) },
            delete => {
                type => 'array',
                items => {
                    type => 'string',
                    format => 'pve-configid',
                },
                optional => 1,
                description => 'A list of settings you want to delete.',
            },
            digest => get_standard_option('pve-config-digest'),

        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $mailto = extract_param($param, 'mailto');
        my $mailto_user = extract_param($param, 'mailto-user');
        my $from_address = extract_param($param, 'from-address');
        my $author = extract_param($param, 'author');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        my $delete = extract_param($param, 'delete');
        my $digest = extract_param($param, 'digest');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->update_sendmail_endpoint(
                    $name,
                    $mailto,
                    $mailto_user,
                    $from_address,
                    $author,
                    $comment,
                    $disable,
                    $delete,
                    $digest,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'delete_sendmail_endpoint',
    protected => 1,
    path => 'endpoints/sendmail/{name}',
    method => 'DELETE',
    description => 'Remove sendmail endpoint',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();
                $config->delete_sendmail_endpoint($name);
                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if ($@);
        return;
    },
});

my $gotify_properties = {
    name => {
        description => 'The name of the endpoint.',
        type => 'string',
        format => 'pve-configid',
    },
    'server' => {
        description => 'Server URL',
        type => 'string',
    },
    'token' => {
        description => 'Secret token',
        type => 'string',
    },
    'comment' => {
        description => 'Comment',
        type => 'string',
        optional => 1,
    },
    'disable' => {
        description => 'Disable this target',
        type => 'boolean',
        optional => 1,
        default => 0,
    },
};

__PACKAGE__->register_method({
    name => 'get_gotify_endpoints',
    path => 'endpoints/gotify',
    method => 'GET',
    description => 'Returns a list of all gotify endpoints',
    protected => 1,
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
        check => ['perm', '/mapping/notifications', ['Mapping.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                %{ remove_protected_properties($gotify_properties, ['token']) },
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();
        my $rpcenv = PVE::RPCEnvironment::get();

        my $entities = eval { $config->get_gotify_endpoints(); };
        raise_api_error($@) if $@;

        return $entities;
    },
});

__PACKAGE__->register_method({
    name => 'get_gotify_endpoint',
    path => 'endpoints/gotify/{name}',
    method => 'GET',
    description => 'Return a specific gotify endpoint',
    protected => 1,
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
                description => 'Name of the endpoint.',
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            %{ remove_protected_properties($gotify_properties, ['token']) },
            digest => get_standard_option('pve-config-digest'),
        },
    },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        my $config = PVE::Notify::read_config();
        my $endpoint = eval { $config->get_gotify_endpoint($name) };

        raise_api_error($@) if $@;
        $endpoint->{digest} = $config->digest();

        return $endpoint;
    },
});

__PACKAGE__->register_method({
    name => 'create_gotify_endpoint',
    path => 'endpoints/gotify',
    protected => 1,
    method => 'POST',
    description => 'Create a new gotify endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => $gotify_properties,
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $server = extract_param($param, 'server');
        my $token = extract_param($param, 'token');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->add_gotify_endpoint(
                    $name, $server, $token, $comment, $disable,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_gotify_endpoint',
    path => 'endpoints/gotify/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing gotify endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %{ make_properties_optional($gotify_properties) },
            delete => {
                type => 'array',
                items => {
                    type => 'string',
                    format => 'pve-configid',
                },
                optional => 1,
                description => 'A list of settings you want to delete.',
            },
            digest => get_standard_option('pve-config-digest'),
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $server = extract_param($param, 'server');
        my $token = extract_param($param, 'token');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        my $delete = extract_param($param, 'delete');
        my $digest = extract_param($param, 'digest');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->update_gotify_endpoint(
                    $name,
                    $server,
                    $token,
                    $comment,
                    $disable,
                    $delete,
                    $digest,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'delete_gotify_endpoint',
    protected => 1,
    path => 'endpoints/gotify/{name}',
    method => 'DELETE',
    description => 'Remove gotify endpoint',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();
                $config->delete_gotify_endpoint($name);
                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

# Endpoints of chat robots and SMS providers. Their URLs contain tokens or they need secrets,
# which are stored in the private configuration.

my $robot_url_property = {
    description => 'Webhook URL of the robot, including its token.',
    type => 'string',
};

my $robot_secret_property = {
    description => 'Secret for signing requests.',
    type => 'string',
    optional => 1,
};

my $sms_text_property = {
    type => 'string',
    maxLength => 128,
};

my $robot_endpoint_types = {
    dingtalk => {
        label => 'DingTalk robot',
        properties => {
            url => $robot_url_property,
            secret => $robot_secret_property,
        },
        private => [qw(url secret)],
    },
    feishu => {
        label => 'Feishu bot',
        properties => {
            url => $robot_url_property,
            secret => $robot_secret_property,
        },
        private => [qw(url secret)],
    },
    wecom => {
        label => 'WeCom robot',
        properties => {
            url => $robot_url_property,
        },
        private => [qw(url)],
    },
    sms => {
        label => 'SMS',
        properties => {
            provider => {
                description => 'SMS provider.',
                type => 'string',
                enum => [qw(aliyun tencent huawei)],
            },
            phone => {
                description => 'Phone numbers, numbers outside of China with country code.',
                type => 'array',
                items => {
                    type => 'string',
                    pattern => '\+?[0-9]{5,20}',
                },
            },
            'sign-name' => {
                %$sms_text_property,
                description => 'Signature name registered at the provider.',
            },
            'template-id' => {
                %$sms_text_property,
                description => 'ID of the message template registered at the provider.',
            },
            'template-param' => {
                description => 'Template parameters, by name for Alibaba Cloud, in order for'
                    . ' Tencent and Huawei Cloud.',
                type => 'array',
                items => {
                    type => 'string',
                    enum => [qw(title severity hostname type time)],
                },
                optional => 1,
            },
            'app-id' => {
                %$sms_text_property,
                description => 'SMS application ID (Tencent Cloud) or sender channel number'
                    . ' (Huawei Cloud).',
                optional => 1,
            },
            region => {
                %$sms_text_property,
                description => 'Region of the provider.',
                optional => 1,
            },
            'access-key' => {
                %$sms_text_property,
                description => 'Access key ID, SecretId or application key.',
            },
            'secret-key' => {
                %$sms_text_property,
                description => 'Access key secret, SecretKey or application secret.',
            },
        },
        private => [qw(access-key secret-key)],
    },
};

# split the parameters into the public and the private configuration
my $split_private_params = sub {
    my ($param, $private_keys, $name) = @_;

    my $private = {};
    for my $key (@$private_keys) {
        my $value = extract_param($param, $key);
        $private->{$key} = $value if defined($value);
    }
    $private->{name} = $name if defined($name);

    return $private;
};

for my $type (sort keys %$robot_endpoint_types) {
    my $info = $robot_endpoint_types->{$type};
    my $label = $info->{label};

    my $properties = {
        name => {
            description => 'The name of the endpoint.',
            type => 'string',
            format => 'pve-configid',
        },
        %{ $info->{properties} },
        comment => {
            description => 'Comment',
            type => 'string',
            optional => 1,
        },
        disable => {
            description => 'Disable this target',
            type => 'boolean',
            optional => 1,
            default => 0,
        },
    };
    my $public_properties = remove_protected_properties($properties, $info->{private});

    my $modify_permissions = {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    };

    __PACKAGE__->register_method({
        name => "get_${type}_endpoints",
        path => "endpoints/$type",
        method => 'GET',
        description => "Returns a list of all $label endpoints",
        protected => 1,
        permissions => {
            check => [
                'or',
                ['perm', '/mapping/notifications', ['Mapping.Modify']],
                ['perm', '/mapping/notifications', ['Mapping.Audit']],
            ],
        },
        parameters => {
            additionalProperties => 0,
            properties => {},
        },
        returns => {
            type => 'array',
            items => {
                type => 'object',
                properties => {
                    %$public_properties,
                    origin => {
                        description => 'Show if this entry was created by a user or was built-in',
                        type => 'string',
                        enum => [qw(user-created builtin modified-builtin)],
                    },
                },
            },
            links => [{ rel => 'child', href => '{name}' }],
        },
        code => sub {
            my $config = PVE::Notify::read_config();
            my $method = "get_${type}_endpoints";

            my $entities = eval { $config->$method() };
            raise_api_error($@) if $@;

            return $entities;
        },
    });

    __PACKAGE__->register_method({
        name => "get_${type}_endpoint",
        path => "endpoints/$type/{name}",
        method => 'GET',
        description => "Return a specific $label endpoint",
        protected => 1,
        permissions => {
            check => [
                'or',
                ['perm', '/mapping/notifications', ['Mapping.Modify']],
                ['perm', '/mapping/notifications', ['Mapping.Audit']],
            ],
        },
        parameters => {
            additionalProperties => 0,
            properties => {
                name => {
                    type => 'string',
                    format => 'pve-configid',
                    description => 'Name of the endpoint.',
                },
            },
        },
        returns => {
            type => 'object',
            properties => {
                %$public_properties,
                digest => get_standard_option('pve-config-digest'),
            },
        },
        code => sub {
            my ($param) = @_;
            my $name = extract_param($param, 'name');

            my $config = PVE::Notify::read_config();
            my $method = "get_${type}_endpoint";
            my $endpoint = eval { $config->$method($name) };

            raise_api_error($@) if $@;
            $endpoint->{digest} = $config->digest();

            return $endpoint;
        },
    });

    __PACKAGE__->register_method({
        name => "create_${type}_endpoint",
        path => "endpoints/$type",
        protected => 1,
        method => 'POST',
        description => "Create a new $label endpoint",
        permissions => $modify_permissions,
        parameters => {
            additionalProperties => 0,
            properties => $properties,
        },
        returns => { type => 'null' },
        code => sub {
            my ($param) = @_;

            my $private = $split_private_params->($param, $info->{private}, $param->{name});

            eval {
                PVE::Notify::lock_config(sub {
                    my $config = PVE::Notify::read_config();
                    my $method = "add_${type}_endpoint";

                    $config->$method($param, $private);

                    PVE::Notify::write_config($config);
                });
            };

            raise_api_error($@) if $@;
            return;
        },
    });

    __PACKAGE__->register_method({
        name => "update_${type}_endpoint",
        path => "endpoints/$type/{name}",
        protected => 1,
        method => 'PUT',
        description => "Update existing $label endpoint",
        permissions => $modify_permissions,
        parameters => {
            additionalProperties => 0,
            properties => {
                %{ make_properties_optional($properties) },
                delete => {
                    type => 'array',
                    items => {
                        type => 'string',
                        format => 'pve-configid',
                    },
                    optional => 1,
                    description => 'A list of settings you want to delete.',
                },
                digest => get_standard_option('pve-config-digest'),
            },
        },
        returns => { type => 'null' },
        code => sub {
            my ($param) = @_;

            my $name = extract_param($param, 'name');
            my $delete = extract_param($param, 'delete');
            my $digest = extract_param($param, 'digest');
            my $private = $split_private_params->($param, $info->{private});

            eval {
                PVE::Notify::lock_config(sub {
                    my $config = PVE::Notify::read_config();
                    my $method = "update_${type}_endpoint";

                    $config->$method($name, $param, $private, $delete, $digest);

                    PVE::Notify::write_config($config);
                });
            };

            raise_api_error($@) if $@;
            return;
        },
    });

    __PACKAGE__->register_method({
        name => "delete_${type}_endpoint",
        protected => 1,
        path => "endpoints/$type/{name}",
        method => 'DELETE',
        description => "Remove $label endpoint",
        permissions => {
            check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
        },
        parameters => {
            additionalProperties => 0,
            properties => {
                name => {
                    type => 'string',
                    format => 'pve-configid',
                },
            },
        },
        returns => { type => 'null' },
        code => sub {
            my ($param) = @_;
            my $name = extract_param($param, 'name');

            eval {
                PVE::Notify::lock_config(sub {
                    my $config = PVE::Notify::read_config();
                    my $method = "delete_${type}_endpoint";
                    $config->$method($name);
                    PVE::Notify::write_config($config);
                });
            };

            raise_api_error($@) if $@;
            return;
        },
    });
}

my $smtp_properties = {
    name => {
        description => 'The name of the endpoint.',
        type => 'string',
        format => 'pve-configid',
    },
    server => {
        description => 'The address of the SMTP server.',
        type => 'string',
    },
    port => {
        description => 'The port to be used. Defaults to 465 for TLS based connections,'
            . ' 587 for STARTTLS based connections and port 25 for insecure plain-text'
            . ' connections.',
        type => 'integer',
        optional => 1,
    },
    mode => {
        description => 'Determine which encryption method shall be used for the connection.',
        type => 'string',
        enum => [qw(insecure starttls tls)],
        default => 'tls',
        optional => 1,
    },
    username => {
        description => 'Username for SMTP authentication',
        type => 'string',
        optional => 1,
    },
    password => {
        description => 'Password for SMTP authentication',
        type => 'string',
        optional => 1,
    },
    mailto => {
        type => 'array',
        items => {
            type => 'string',
            format => 'email-or-username',
        },
        description => 'List of email recipients',
        optional => 1,
    },
    'mailto-user' => {
        type => 'array',
        items => {
            type => 'string',
            format => 'pve-userid',
        },
        description => 'List of users',
        optional => 1,
    },
    'from-address' => {
        description => '`From` address for the mail',
        type => 'string',
    },
    author => {
        description => 'Author of the mail. Defaults to \'Proxmox VE\'.',
        type => 'string',
        optional => 1,
    },
    'comment' => {
        description => 'Comment',
        type => 'string',
        optional => 1,
    },
    'disable' => {
        description => 'Disable this target',
        type => 'boolean',
        optional => 1,
        default => 0,
    },
};

__PACKAGE__->register_method({
    name => 'get_smtp_endpoints',
    path => 'endpoints/smtp',
    method => 'GET',
    description => 'Returns a list of all smtp endpoints',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                %{ remove_protected_properties($smtp_properties, ['password']) },
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();

        my $entities = eval { $config->get_smtp_endpoints(); };
        raise_api_error($@) if $@;

        return $entities;
    },
});

__PACKAGE__->register_method({
    name => 'get_smtp_endpoint',
    path => 'endpoints/smtp/{name}',
    method => 'GET',
    description => 'Return a specific smtp endpoint',
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    protected => 1,
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            %{ remove_protected_properties($smtp_properties, ['password']) },
            digest => get_standard_option('pve-config-digest'),
        },

    },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        my $config = PVE::Notify::read_config();
        my $endpoint = eval { $config->get_smtp_endpoint($name) };

        raise_api_error($@) if $@;
        $endpoint->{digest} = $config->digest();

        return $endpoint;
    },
});

__PACKAGE__->register_method({
    name => 'create_smtp_endpoint',
    path => 'endpoints/smtp',
    protected => 1,
    method => 'POST',
    description => 'Create a new smtp endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => $smtp_properties,
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $server = extract_param($param, 'server');
        my $port = extract_param($param, 'port');
        my $mode = extract_param($param, 'mode');
        my $username = extract_param($param, 'username');
        my $password = extract_param($param, 'password');
        my $mailto = extract_param($param, 'mailto');
        my $mailto_user = extract_param($param, 'mailto-user');
        my $from_address = extract_param($param, 'from-address');
        my $author = extract_param($param, 'author');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->add_smtp_endpoint(
                    $name,
                    $server,
                    $port,
                    $mode,
                    $username,
                    $password,
                    $mailto,
                    $mailto_user,
                    $from_address,
                    $author,
                    $comment,
                    $disable,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_smtp_endpoint',
    path => 'endpoints/smtp/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing smtp endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %{ make_properties_optional($smtp_properties) },
            delete => {
                type => 'array',
                items => {
                    type => 'string',
                    format => 'pve-configid',
                },
                optional => 1,
                description => 'A list of settings you want to delete.',
            },
            digest => get_standard_option('pve-config-digest'),

        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $server = extract_param($param, 'server');
        my $port = extract_param($param, 'port');
        my $mode = extract_param($param, 'mode');
        my $username = extract_param($param, 'username');
        my $password = extract_param($param, 'password');
        my $mailto = extract_param($param, 'mailto');
        my $mailto_user = extract_param($param, 'mailto-user');
        my $from_address = extract_param($param, 'from-address');
        my $author = extract_param($param, 'author');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        my $delete = extract_param($param, 'delete');
        my $digest = extract_param($param, 'digest');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->update_smtp_endpoint(
                    $name,
                    $server,
                    $port,
                    $mode,
                    $username,
                    $password,
                    $mailto,
                    $mailto_user,
                    $from_address,
                    $author,
                    $comment,
                    $disable,
                    $delete,
                    $digest,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'delete_smtp_endpoint',
    protected => 1,
    path => 'endpoints/smtp/{name}',
    method => 'DELETE',
    description => 'Remove smtp endpoint',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();
                $config->delete_smtp_endpoint($name);
                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if ($@);
        return;
    },
});

my $webhook_properties = {
    name => {
        description => 'The name of the endpoint.',
        type => 'string',
        format => 'pve-configid',
    },
    url => {
        description => 'Server URL',
        type => 'string',
    },
    method => {
        description => 'HTTP method',
        type => 'string',
        enum => [qw(post put get)],
    },
    header => {
        description => 'HTTP headers to set. These have to be formatted as'
            . ' a property string in the format name=<name>,value=<base64 of value>',
        type => 'array',
        items => {
            type => 'string',
        },
        optional => 1,
    },
    body => {
        description => 'HTTP body, base64 encoded',
        type => 'string',
        optional => 1,
    },
    secret => {
        description => 'Secrets to set. These have to be formatted as'
            . ' a property string in the format name=<name>,value=<base64 of value>',
        type => 'array',
        items => {
            type => 'string',
        },
        optional => 1,
    },
    comment => {
        description => 'Comment',
        type => 'string',
        optional => 1,
    },
    disable => {
        description => 'Disable this target',
        type => 'boolean',
        optional => 1,
        default => 0,
    },
};

__PACKAGE__->register_method({
    name => 'get_webhook_endpoints',
    path => 'endpoints/webhook',
    method => 'GET',
    description => 'Returns a list of all webhook endpoints',
    protected => 1,
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
        check => ['perm', '/mapping/notifications', ['Mapping.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                %$webhook_properties,
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();
        my $rpcenv = PVE::RPCEnvironment::get();

        my $entities = eval { $config->get_webhook_endpoints(); };
        raise_api_error($@) if $@;

        return $entities;
    },
});

__PACKAGE__->register_method({
    name => 'get_webhook_endpoint',
    path => 'endpoints/webhook/{name}',
    method => 'GET',
    description => 'Return a specific webhook endpoint',
    protected => 1,
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
                description => 'Name of the endpoint.',
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            %$webhook_properties, digest => get_standard_option('pve-config-digest'),
        },
    },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        my $config = PVE::Notify::read_config();
        my $endpoint = eval { $config->get_webhook_endpoint($name) };

        raise_api_error($@) if $@;
        $endpoint->{digest} = $config->digest();

        return $endpoint;
    },
});

__PACKAGE__->register_method({
    name => 'create_webhook_endpoint',
    path => 'endpoints/webhook',
    protected => 1,
    method => 'POST',
    description => 'Create a new webhook endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => $webhook_properties,
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->add_webhook_endpoint(
                    $param,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_webhook_endpoint',
    path => 'endpoints/webhook/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing webhook endpoint',
    permissions => {
        check => [
            'and',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            [
                'or',
                ['perm', '/', ['Sys.Audit', 'Sys.Modify']],
                ['perm', '/', ['Sys.AccessNetwork']],
            ],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %{ make_properties_optional($webhook_properties) },
            delete => {
                type => 'array',
                items => {
                    type => 'string',
                    format => 'pve-configid',
                },
                optional => 1,
                description => 'A list of settings you want to delete.',
            },
            digest => get_standard_option('pve-config-digest'),
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $delete = extract_param($param, 'delete');
        my $digest = extract_param($param, 'digest');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->update_webhook_endpoint(
                    $name,
                    $param, # Config updater
                    $delete,
                    $digest,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'delete_webhook_endpoint',
    protected => 1,
    path => 'endpoints/webhook/{name}',
    method => 'DELETE',
    description => 'Remove webhook endpoint',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();
                $config->delete_webhook_endpoint($name);
                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

my $matcher_properties = {
    name => {
        description => 'Name of the matcher.',
        type => 'string',
        format => 'pve-configid',
    },
    'match-field' => {
        type => 'array',
        items => {
            type => 'string',
        },
        optional => 1,
        description => 'Metadata fields to match (regex or exact match).'
            . ' Must be in the form (regex|exact):<field>=<value>',
    },
    'match-severity' => {
        type => 'array',
        items => {
            type => 'string',
        },
        optional => 1,
        description => 'Notification severities to match',
    },
    'match-calendar' => {
        type => 'array',
        items => {
            type => 'string',
        },
        optional => 1,
        description => 'Match notification timestamp',
    },
    'target' => {
        type => 'array',
        items => {
            type => 'string',
            format => 'pve-configid',
        },
        optional => 1,
        description => 'Targets to notify on match',
    },
    mode => {
        type => 'string',
        description =>
            "Choose between 'all' and 'any' for when multiple properties are specified",
        optional => 1,
        enum => [qw(all any)],
        default => 'all',
    },
    'invert-match' => {
        type => 'boolean',
        description => 'Invert match of the whole matcher',
        optional => 1,
    },
    'comment' => {
        description => 'Comment',
        type => 'string',
        optional => 1,
    },
    'disable' => {
        description => 'Disable this matcher',
        type => 'boolean',
        optional => 1,
        default => 0,
    },
};

__PACKAGE__->register_method({
    name => 'get_matchers',
    path => 'matchers',
    method => 'GET',
    description => 'Returns a list of all matchers',
    protected => 1,
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
            ['perm', '/mapping/notifications', ['Mapping.Use']],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {},
    },
    returns => {
        type => 'array',
        items => {
            type => 'object',
            properties => {
                %$matcher_properties,
                'origin' => {
                    description => 'Show if this entry was created by a user or was built-in',
                    type => 'string',
                    enum => [qw(user-created builtin modified-builtin)],
                },
            },
        },
        links => [{ rel => 'child', href => '{name}' }],
    },
    code => sub {
        my $config = PVE::Notify::read_config();

        my $entities = eval { $config->get_matchers(); };
        raise_api_error($@) if $@;

        return $entities;
    },
});

__PACKAGE__->register_method({
    name => 'get_matcher',
    path => 'matchers/{name}',
    method => 'GET',
    description => 'Return a specific matcher',
    protected => 1,
    permissions => {
        check => [
            'or',
            ['perm', '/mapping/notifications', ['Mapping.Modify']],
            ['perm', '/mapping/notifications', ['Mapping.Audit']],
        ],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => {
        type => 'object',
        properties => {
            %$matcher_properties, digest => get_standard_option('pve-config-digest'),
        },
    },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        my $config = PVE::Notify::read_config();

        my $matcher = eval { $config->get_matcher($name) };

        raise_api_error($@) if $@;
        $matcher->{digest} = $config->digest();

        return $matcher;
    },
});

__PACKAGE__->register_method({
    name => 'create_matcher',
    path => 'matchers',
    protected => 1,
    method => 'POST',
    description => 'Create a new matcher',
    protected => 1,
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => $matcher_properties,
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $match_severity = extract_param($param, 'match-severity');
        my $match_field = extract_param($param, 'match-field');
        my $match_calendar = extract_param($param, 'match-calendar');
        my $target = extract_param($param, 'target');
        my $mode = extract_param($param, 'mode');
        my $invert_match = extract_param($param, 'invert-match');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->add_matcher(
                    $name,
                    $target,
                    $match_severity,
                    $match_field,
                    $match_calendar,
                    $mode,
                    $invert_match,
                    $comment,
                    $disable,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'update_matcher',
    path => 'matchers/{name}',
    protected => 1,
    method => 'PUT',
    description => 'Update existing matcher',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            %{ make_properties_optional($matcher_properties) },
            delete => {
                type => 'array',
                items => {
                    type => 'string',
                    format => 'pve-configid',
                },
                optional => 1,
                description => 'A list of settings you want to delete.',
            },
            digest => get_standard_option('pve-config-digest'),
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;

        my $name = extract_param($param, 'name');
        my $match_severity = extract_param($param, 'match-severity');
        my $match_field = extract_param($param, 'match-field');
        my $match_calendar = extract_param($param, 'match-calendar');
        my $target = extract_param($param, 'target');
        my $mode = extract_param($param, 'mode');
        my $invert_match = extract_param($param, 'invert-match');
        my $comment = extract_param($param, 'comment');
        my $disable = extract_param($param, 'disable');
        my $digest = extract_param($param, 'digest');
        my $delete = extract_param($param, 'delete');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();

                $config->update_matcher(
                    $name,
                    $target,
                    $match_severity,
                    $match_field,
                    $match_calendar,
                    $mode,
                    $invert_match,
                    $comment,
                    $disable,
                    $delete,
                    $digest,
                );

                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

__PACKAGE__->register_method({
    name => 'delete_matcher',
    protected => 1,
    path => 'matchers/{name}',
    method => 'DELETE',
    description => 'Remove matcher',
    permissions => {
        check => ['perm', '/mapping/notifications', ['Mapping.Modify']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            name => {
                type => 'string',
                format => 'pve-configid',
            },
        },
    },
    returns => { type => 'null' },
    code => sub {
        my ($param) = @_;
        my $name = extract_param($param, 'name');

        eval {
            PVE::Notify::lock_config(sub {
                my $config = PVE::Notify::read_config();
                $config->delete_matcher($name);
                PVE::Notify::write_config($config);
            });
        };

        raise_api_error($@) if $@;
        return;
    },
});

1;
