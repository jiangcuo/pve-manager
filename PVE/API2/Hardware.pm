package PVE::API2::Hardware;

use strict;
use warnings;

use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;

use PVE::API2::Hardware::PCI;
use PVE::API2::Hardware::USB;
use PVE::API2::Hardware::INFO;
use PVE::API2::Hardware::NET;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Hardware::PCI",
    path => 'pci',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Hardware::USB",
    path => 'usb',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Hardware::INFO",
    path => 'info',
});

__PACKAGE__->register_method ({
    subclass => "PVE::API2::Hardware::NET",
    path => 'net',
});


__PACKAGE__->register_method ({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Index of hardware types",
    permissions => {
	user => 'all',
    },
    parameters => {
	additionalProperties => 0,
	properties => {
	    node => get_standard_option('pve-node'),
	},
    },
    returns => {
	type => 'array',
	items => {
	    type => "object",
	    properties => { type => { type => 'string'} },
	},
	links => [ { rel => 'child', href => "{type}" } ],
    },
    code => sub {
	my ($param) = @_;

	my $res = [
	    { type => 'pci' },
	    { type => 'usb' },
	    { type => 'info' },
		{ type => 'net' },
	];

	return $res;
    }
});

