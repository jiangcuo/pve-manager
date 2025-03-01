package PVE::API2::Hardware::INFO;

use strict;
use warnings;

use PVE::JSONSchema qw(get_standard_option);

use PVE::RESTHandler;
use PVE::SysFSTools;
use File::Slurp;

use base qw(PVE::RESTHandler);


__PACKAGE__->register_method({
    name => 'hardwareinfo',
    path => '',
    method => 'GET',
    permissions => {
	check => ['perm', '/nodes/{node}', [ 'Sys.Audit' ]],
    },
    description => "Read node hardwareinfo",
    protected => 1,
    proxyto => 'node',
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => "string"
    },
    code => sub {
		my ($param) = @_;

		my $res;
		my $path =  "/var/run/pve/query-machine-info";
		if (-b $path){
			$res =  read_file($path);
		}else {
			my $cmd = ["/usr/sbin/dmidecode"];
			push @$cmd, '-t', $param->{type} if $param->{type};
			push @$cmd, ' |jc --dmidecode';
			$res = qx(@$cmd);
		}
	return $res;
    }});