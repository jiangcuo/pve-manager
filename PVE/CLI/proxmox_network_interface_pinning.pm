package PVE::CLI::proxmox_network_interface_pinning;

use v5.36;

use File::Copy;
use POSIX qw(:errno_h);
use Storable qw(dclone);

use PVE::Firewall;
use PVE::INotify;
use PVE::Network;
use PVE::Network::SDN;
use PVE::Network::SDN::Controllers;
use PVE::RPCEnvironment;
use PVE::SectionConfig;
use PVE::Tools;

use PVE::CLIHandler;
use base qw(PVE::CLIHandler);

my $PVEETH_LOCK = "/run/lock/proxmox-network-interface-pinning.lck";

sub setup_environment {
    PVE::RPCEnvironment->setup_default_cli_env();
}

my sub update_sdn_controllers {
    my ($mapping) = @_;

    print "Updating /etc/pve/sdn/controllers.cfg\n";

    my $code = sub {
        my $controllers = PVE::Network::SDN::Controllers::config();

        my $local_node = PVE::INotify::nodename();

        for my $controller (values $controllers->{ids}->%*) {
            next
                if $local_node ne $controller->{node}
                || $controller->{type} ne 'isis';

            $controller->{'isis-ifaces'} = $mapping->list($controller->{'isis-ifaces'});
        }

        PVE::Network::SDN::Controllers::write_config($controllers);
    };

    PVE::Network::SDN::lock_sdn_config($code);
}

my sub update_etc_network_interfaces {
    my ($mapping, $existing_pins) = @_;

    print "Updating /etc/network/interfaces.new\n";

    my $code = sub {
        my $config = dclone(PVE::INotify::read_file('interfaces'));

        my $old_ifaces = $config->{ifaces};
        my $new_ifaces = {};

        for my $iface_name (keys $old_ifaces->%*) {
            my $iface = $old_ifaces->{$iface_name};

            if ($existing_pins->{$iface_name}) {
                # reading the interfaces file adds active interfaces to the
                # configuration - we do not want to include already pinned
                # interfaces in the new configuration when writing the new
                # interface file multiple times, so we skip the interface here
                # if there already exists a pin for it.
                next;
            }

            if ($iface->{type} =~ m/^(eth|OVSPort|alias)$/) {
                $iface_name = $mapping->name($iface_name);
            } elsif ($iface->{type} eq 'vlan') {
                $iface_name = $mapping->name($iface_name);
                $iface->{'vlan-raw-device'} = $mapping->name($iface->{'vlan-raw-device'});
            } elsif ($iface->{type} eq 'bond') {
                $iface->{'bond-primary'} = $mapping->name($iface->{'bond-primary'});
                $iface->{slaves} = $mapping->list($iface->{slaves});
            } elsif ($iface->{type} eq 'bridge') {
                $iface->{bridge_ports} = $mapping->list($iface->{bridge_ports});
            } elsif ($iface->{type} eq 'OVSBridge') {
                $iface->{ovs_ports} = $mapping->list($iface->{ovs_ports});
            } elsif ($iface->{type} eq 'OVSBond') {
                $iface->{ovs_bonds} = $mapping->list($iface->{ovs_bonds});
            }

            $new_ifaces->{$iface_name} = $iface;
        }

        $config->{ifaces} = $new_ifaces;
        PVE::INotify::write_file('interfaces', $config, 1);
    };

    PVE::Tools::lock_file("/etc/network/.pve-interfaces.lock", 10, $code);
}

my sub update_host_fw_config {
    my ($mapping) = @_;

    my $local_node = PVE::INotify::nodename();
    print "Updating /etc/pve/nodes/$local_node/host.fw.new\n";

    my $code = sub {
        my $cluster_conf = PVE::Firewall::load_clusterfw_conf();

        my $temp_fw_file = "/etc/pve/nodes/$local_node/host.fw.new";

        my $host_fw_file = (-e $temp_fw_file) ? $temp_fw_file : undef;
        my $host_conf = PVE::Firewall::load_hostfw_conf($cluster_conf, $host_fw_file);

        for my $rule ($cluster_conf->{rules}->@*) {
            next if !$rule->{iface};

            warn "found reference to iface $rule->{iface} in cluster config - not updating."
                if $mapping->{ $rule->{iface} };
        }

        for my $rule ($host_conf->{rules}->@*) {
            next if !$rule->{iface};
            $rule->{iface} = $mapping->name($rule->{iface});
        }

        PVE::Firewall::save_hostfw_conf($host_conf, "/etc/pve/nodes/$local_node/host.fw.new");
    };

    PVE::Firewall::run_locked($code);
}

my sub parse_link_file {
    my ($file_name) = @_;

    my $content = PVE::Tools::file_get_contents($file_name);
    my @lines = split(/\n/, $content);

    my $section;
    my $data = {};

    for my $line (@lines) {
        next if $line =~ m/^\s*$/;

        if ($line =~ m/^\[(Match|Link)\]$/) {
            $section = $1;
            $data->{$section} = {};
        } elsif ($line =~ m/^([a-zA-Z]+)=(.+)$/) {
            die "key-value pair before section" if !$section;
            $data->{$section}->{$1} = $2;
        } else {
            die "unrecognized line";
        }
    }

    return $data;
}

my $LINK_DIRECTORY = "/usr/local/lib/systemd/network/";

sub ensure_link_directory_exists {
    mkdir '/usr/local/lib/systemd' if !-d '/usr/local/lib/systemd';
    mkdir $LINK_DIRECTORY if !-d $LINK_DIRECTORY;
}

my sub get_pinned {
    my $link_files = {};

    ensure_link_directory_exists();

    PVE::Tools::dir_glob_foreach(
        $LINK_DIRECTORY,
        qr/^50-pve-(.+)\.link$/,
        sub {
            my $parsed = parse_link_file($LINK_DIRECTORY . $_[0]);
            $link_files->{ $parsed->{'Match'}->{'MACAddress'} } = $parsed->{'Link'}->{'Name'};
        },
    );

    return $link_files;
}

my $LINK_FILE_TEMPLATE = <<EOF;
[Match]
MACAddress=%s
Type=ether

[Link]
Name=%s
EOF

my sub link_file_name {
    my ($iface_name) = @_;
    return "50-pve-$iface_name.link";
}

my sub delete_link_files {
    my ($pinned) = @_;

    ensure_link_directory_exists();

    for my $iface_name (values %$pinned) {
        my $link_file = $LINK_DIRECTORY . link_file_name($iface_name);

        if (!unlink $link_file) {
            return if $! == ENOENT;
            warn "failed to delete $link_file";
        }
    }
}

my sub generate_link_files {
    my ($ip_links, $mapping) = @_;

    print "Generating link files\n";

    ensure_link_directory_exists();

    for my $ip_link (values $ip_links->%*) {
        my $mapped_name = $mapping->name($ip_link->{ifname});
        my $link_file_content =
            sprintf($LINK_FILE_TEMPLATE, get_ip_link_mac($ip_link), $mapped_name);

        PVE::Tools::file_set_contents(
            $LINK_DIRECTORY . link_file_name($mapped_name),
            $link_file_content,
        );
    }
}

package PVE::CLI::proxmox_network_interface_pinning::InterfaceMapping {
    use PVE::CLI::proxmox_network_interface_pinning;
    use PVE::Tools;

    sub generate {
        my ($class, $ip_links, $pinned, $prefix) = @_;

        my $index = 0;
        my $mapping = {};

        my %existing_names = map { $_ => 1 } values $pinned->%*;

        for my $ifname (sort keys $ip_links->%*) {
            my $ip_link = $ip_links->{$ifname};
            my $generated_name;

            do {
                $generated_name = $prefix . $index++;
            } while ($existing_names{$generated_name});

            $mapping->{$ifname} = $generated_name;

            for my $altname ($ip_link->{altnames}->@*) {
                $mapping->{$altname} = $generated_name;
            }
        }

        bless $mapping, $class;
    }

    sub name {
        my ($self, $iface_name) = @_;

        if ($iface_name =~ m/^([a-zA-Z0-9_]+)([:\.]\d+)$/) {
            my $mapped_name = $self->{$1} // $1;
            my $suffix = $2;

            return "$mapped_name$suffix";
        }

        return $self->{$iface_name} // $iface_name;
    }

    sub list {
        my ($self, $list) = @_;

        my @mapped_list = map { $self->name($_) } PVE::Tools::split_list($list);
        return join(' ', @mapped_list);
    }
}

sub get_ip_link_mac {
    my ($ip_link) = @_;

    # members of bonds can have a different MAC than the physical interface, so
    # we need to check if they're enslaved
    return $ip_link->{link_info}->{info_slave_data}->{perm_hwaddr} // $ip_link->{address};
}

sub get_ip_links {
    my $ip_links = PVE::Network::ip_link_details();

    for my $iface_name (keys $ip_links->%*) {
        delete $ip_links->{$iface_name}
            if !PVE::Network::ip_link_is_physical($ip_links->{$iface_name});
    }

    return $ip_links;
}

sub resolve_pinned {
    my ($ip_links, $pinned) = @_;

    my %mac_lookup = map { get_ip_link_mac($_) => $_->{ifname} } values $ip_links->%*;

    my $resolved = {};

    for my $mac (keys $pinned->%*) {
        if (!$mac_lookup{$mac}) {
            warn "could not resolve $mac to an existing interface";
            next;
        }

        $resolved->{ $mac_lookup{$mac} } = $pinned->{$mac};
    }

    return $resolved;
}

__PACKAGE__->register_method({
    name => 'generate',
    path => 'generate',
    method => 'POST',
    description => 'Generate systemd.link files to pin the names of one or more network'
        . ' interfaces and update all network-related configuration files.',
    parameters => {
        additionalProperties => 0,
        properties => {
            # TODO: support a target name or prefix once pve-common supports generic physical ifaces
            interface => {
                description => 'Only pin a specific interface.',
                type => 'string',
                format => 'pve-iface',
                default => '<all>', # just for the docs.
                optional => 1,
            },
        },
    },
    returns => {
        type => 'null',
    },
    code => sub {
        my ($params) = @_;

        my $iface = $params->{interface}; # undef means all.

        if (-t STDOUT) {
            my $target = defined($iface) ? "the interface '$iface'" : 'all interfaces';
            say "This will generate name pinning configuration for $target - continue (y/N)? ";

            my $answer = <STDIN>;
            my $continue = defined($answer) && $answer =~ m/^\s*y(?:es)?\s*$/i;

            die "Aborting pinning as requested\n" if !$continue;
        }

        my $code = sub {
            my $prefix = 'nic'; # TODO: make flexible once pve-common supports that.

            my $ip_links = get_ip_links();
            my $pinned = get_pinned();
            my $existing_pins = resolve_pinned($ip_links, $pinned);

            if ($iface) {
                die "Could not find link with name '$iface'\n" if !$ip_links->{$iface};

                die "There already exists a pin for NIC '$iface' - aborting.\n"
                    if $existing_pins->{$iface};

                $ip_links = { $iface => $ip_links->{$iface} };
            } else {
                for my $iface_name (keys $existing_pins->%*) {
                    delete $ip_links->{$iface_name};
                }
            }

            my $mapping =
                PVE::CLI::proxmox_network_interface_pinning::InterfaceMapping->generate(
                    $ip_links,
                    $pinned,
                    $prefix,
                );

            for my $old_name (sort keys $mapping->%*) {
                print "Renaming link '$old_name' to '$mapping->{$old_name}'\n";
            }

            generate_link_files($ip_links, $mapping);
            print "Succesfully generated .link files\n";

            update_host_fw_config($mapping);
            update_etc_network_interfaces($mapping, $existing_pins);
            update_sdn_controllers($mapping);

            print "Successfully updated Proxmox VE configuration files\n";
            print "Please reboot to apply the changes to your configuration\n";
        };

        PVE::Tools::lock_file($PVEETH_LOCK, 10, $code);
        die $@ if $@;

        return;
    },
});

our $cmddef = {
    generate => [__PACKAGE__, 'generate', [], {}],
};

1;
