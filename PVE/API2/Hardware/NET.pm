package PVE::API2::Hardware::NET;

use strict;
use warnings;

use PVE::JSONSchema qw(get_standard_option);

use PVE::RESTHandler;
use PVE::SysFSTools;
use File::Basename;
use Cwd 'realpath';
use PVE::Tools qw(file_read_firstline dir_glob_foreach);
use base qw(PVE::RESTHandler);


__PACKAGE__->register_method({
    name => 'net',
    path => '',
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read node network device ",
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	    type => {
		description => "get type",
		type => 'string',
		optional => 1,
	    }
	}
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => {
		name => {
		    type => 'string',
		    description => "The network name.",
		},
		driver => {
		    type => 'string',
		    description => 'The network dirver.',
		},
		pciid => {
		    type => 'string',
		    description => 'The network pciid.',
		},
		speed => {
		    type => 'string',
		    description => 'The network speed.',
		},
		devname => {
		    type => 'string',
		    description => 'The network devname.',
		}
	    }
	}
    },
    code => sub {
		my ($param) = @_;

        my $pattern = '^(eth|eno|ens|wl|enp)\w*';

        my $res = [];

        dir_glob_foreach('/sys/class/net/', $pattern, sub {
            my ($dev) = @_;
            return if ! -d "/sys/class/net/$dev/device/";
            my $path = realpath("/sys/class/net/$dev/device/");
            my $pciid;
            if ($path =~ /^virtio/){
                $pciid = basename(realpath("/sys/class/net/$dev/device/../"));
            } else{
                $pciid = basename(realpath("/sys/class/net/$dev/device/"));
            }
            unless ($pciid =~ /^(
				(?:[0-9a-fA-F]{4}:)?    
				[0-9a-fA-F]{2}:         
				[0-9a-fA-F]{2}\.      
				[0-9a-fA-F]    
			)$/x
			) {
				return;
			}
			my $safe_pciid = $1;

            my $driver = basename(realpath("/sys/bus/pci/devices/$safe_pciid/driver/"));
            my $speed = file_read_firstline("/sys/class/net/$dev/speed");
            # my $cmd = ["lspci","-s",$safe_pciid];
			# # push @$cmd, ' |grep "Subsystem"';
            # # push @$cmd, ' |cut -d ":" -f2';\
			my $devname = `lspci -ks $safe_pciid | grep "Subsystem" | cut -d ":" -f2`;
			
            # 输出网卡信息
            push @$res , {
                name => $dev,
                driver => $driver,
                pciid  => $safe_pciid,
                speed => $speed,
                devname => $devname
            }
        });
		
	    return $res;
    }});
