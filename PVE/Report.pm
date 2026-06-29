package PVE::Report;

use strict;
use warnings;

use File::Basename qw(basename);
use File::Glob qw(bsd_glob);

use PVE::Tools;

# output the content of all the files of a directory
my sub dir2text {
    my ($target_dir, $regexp) = @_;

    print STDERR "dir2text '${target_dir}${regexp}'...";
    my $text = "# output '${target_dir}${regexp}' file(s)\n";
    PVE::Tools::dir_glob_foreach(
        $target_dir,
        $regexp,
        sub {
            my ($file) = @_;
            return if $file eq '.' || $file eq '..';
            $text .= "\n# cat $target_dir$file\n";
            $text .= PVE::Tools::file_get_contents($target_dir . $file) . "\n";
        },
    );
    return $text;
}

# command -v is the posix equivalent of 'which'
my sub cmd_exists { system("command -v '$_[0]' > /dev/null 2>&1") == 0 }

my $init_report_cmds = sub {
    my $report_def = {
        general => {
            title => 'general system info',
            order => 10,
            cmds => [
                'hostname',
                'date -R',
                'cat /proc/cmdline',
                'pveversion --verbose',
                'cat /etc/hosts',
                'pvesubscription get',
                'cat /etc/apt/sources.list',
                sub { dir2text('/etc/apt/sources.list.d/', '.+\.list') },
                sub { dir2text('/etc/apt/sources.list.d/', '.+\.sources') },
                'apt-cache policy | grep -vP "^ +origin "',
                'apt-mark showhold',
                'lscpu',
                'pvesh get /cluster/resources --type node --output-format=yaml',
            ],
        },
        'system-load' => {
            title => 'overall system load info',
            order => 20,
            cmds => [
                'top -b -c -w512 -n 1 -o TIME | head -n 30', 'head /proc/pressure/*',
            ],
        },
        storage => {
            order => 30,
            cmds => [
                'cat /etc/pve/storage.cfg',
                'pvesm status',
                'cat /etc/fstab',
                'findmnt --ascii',
                'df --human -T',
                'proxmox-boot-tool status',
            ],
        },
        'virtual guests' => {
            order => 40,
            cmds => [
                'qm list',
                sub { dir2text('/etc/pve/qemu-server/', '\d+\.conf') },
                'pct list',
                sub { dir2text('/etc/pve/lxc/', '\d+\.conf') },
            ],
        },
        network => {
            order => 45,
            cmds => [
                'ip -details -statistics address',
                'ip -details -4 route show',
                'ip -details -6 route show',
                'cat /etc/network/interfaces',
                sub { dir2text('/etc/network/interfaces.d/', '.*') },
                'cat /etc/pve/sdn/.running-config',
                sub { dir2text('/etc/pve/sdn/', '.+\.cfg') },
                sub { dir2text('/etc/pve/sdn/', '.+\.json') },
            ],
        },
        firewall => {
            order => 50,
            cmds => [
                sub { dir2text('/etc/pve/firewall/', '.+\.fw') },
                'cat /etc/pve/local/host.fw',
                sub { dir2text('/etc/pve/sdn/firewall/', '.+\.fw') },
                'iptables-save -c | column -t -l4 -o" "',
            ],
        },
        cluster => {
            order => 60,
            cmds => [
                'pvecm nodes',
                'pvecm status',
                'cat /etc/pve/corosync.conf 2>/dev/null',
                'ha-manager status',
                'cat /etc/pve/datacenter.cfg',
            ],
        },
        jobs => {
            order => 65,
            cmds => [
                'cat /etc/pve/jobs.cfg',
            ],
        },
        hardware => {
            order => 70,
            cmds => [
                'dmidecode -t bios', 'lspci -nnk',
            ],
        },
        'block devices' => {
            order => 80,
            cmds => [
                'lsblk --ascii -M -o +HOTPLUG,ROTA,PHY-SEC,FSTYPE,MODEL,TRAN,WWN',
                'ls -l /dev/disk/by-*/',
                'iscsiadm -m node',
                'iscsiadm -m session',
            ],
        },
        volumes => {
            order => 90,
            cmds => [
                'pvs', 'lvs', 'vgs',
            ],
        },
    };

    if (cmd_exists('zfs')) {
        push @{ $report_def->{volumes}->{cmds} },
            'zpool status',
            'zpool list -v',
            'zfs list',
            'arcstat',
            ;
    }

    if (-e '/etc/ceph/ceph.conf') {
        push @{ $report_def->{volumes}->{cmds} },
            'pveceph status',
            'ceph osd status',
            'ceph df',
            'ceph osd df tree',
            'ceph device ls',
            'cat /etc/ceph/ceph.conf',
            'ceph config dump',
            'pveceph pool ls',
            'ceph versions',
            'ceph health detail',
            ;
    }

    if (cmd_exists('multipath')) {
        push @{ $report_def->{disks}->{cmds} },
            'cat /etc/multipath.conf',
            'cat /etc/multipath/wwids',
            'multipath -ll',
            ;
    }

    return $report_def;
};

sub generate {
    my $def = $init_report_cmds->();

    my $report = '';
    my $record_output = sub {
        $report .= shift . "\n";
    };

    local $ENV{'PATH'} = '/sbin:/bin:/usr/sbin:/usr/bin';
    my $cmd_timeout = 10; # generous timeout

    my $run_cmd_params = {
        outfunc => $record_output,
        errfunc => $record_output,
        timeout => $cmd_timeout,
        noerr => 1, # avoid checking programs exit code
    };

    my $sorter =
        sub { ($def->{ $_[0] }->{order} // 1 << 30) <=> ($def->{ $_[1] }->{order} // 1 << 30) };

    for my $section (sort { $sorter->($a, $b) } keys %$def) {
        my $s = $def->{$section};
        my $title = $s->{title} // "info about $section";

        $report .= "\n==== $title ====\n";
        for my $command (@{ $s->{cmds} }) {
            eval {
                if (ref $command eq 'CODE') {
                    $report .= PVE::Tools::run_with_timeout($cmd_timeout, $command);
                } else {
                    print STDERR "Process " . $command . "...";
                    $report .= "\n# $command\n";
                    PVE::Tools::run_command($command, %$run_cmd_params);
                }
                print STDERR "OK";
            };
            print STDERR "\n";
            $report .= "\nERROR: $@\n" if $@;
        }
    }

    return $report;
}

my sub sos_command {
    if (cmd_exists('sos')) {
        return ['sos', 'report', '--batch'];
    } elsif (cmd_exists('sosreport')) {
        return ['sosreport', '--batch'];
    }

    die "sos report tool not found; install the 'sosreport' or 'sos' package\n";
}

my sub find_sos_archive {
    my ($output, $since) = @_;

    for my $line (split(/\n/, $output)) {
        if ($line =~ m{^\s*(/.*?\.(?:tar\.(?:xz|gz|bz2)|tgz|txz|zip))\s*$}) {
            return $1 if -f $1;
        }
    }

    my @candidates;
    for my $pattern (
        '/var/tmp/sosreport-*',
        '/var/tmp/sos-*',
        '/tmp/sosreport-*',
        '/tmp/sos-*',
    ) {
        for my $path (bsd_glob($pattern)) {
            next if $path !~ m{\.(?:tar\.(?:xz|gz|bz2)|tgz|txz|zip)$};
            my @stat = stat($path) or next;
            next if $stat[9] < ($since - 5);
            push @candidates, [$stat[9], $path];
        }
    }

    @candidates = sort { $b->[0] <=> $a->[0] } @candidates;
    return $candidates[0]->[1] if @candidates;

    die "unable to find generated sos report archive\n";
}

my sub archive_content_type {
    my ($filename) = @_;

    return 'application/x-xz' if $filename =~ m/\.xz$/;
    return 'application/gzip' if $filename =~ m/\.(?:gz|tgz)$/;
    return 'application/x-bzip2' if $filename =~ m/\.bz2$/;
    return 'application/zip' if $filename =~ m/\.zip$/;

    return 'application/octet-stream';
}

sub generate_sos_archive {
    my (%opts) = @_;

    local $ENV{'PATH'} = '/sbin:/bin:/usr/sbin:/usr/bin';

    my $cmd = sos_command();
    my $timeout = $opts{timeout} // 900;
    my $output = '';
    my $record_output = sub {
        my $line = shift;
        $output .= $line . "\n";
        print "$line\n" if $opts{print_output};
    };

    my $since = time();
    PVE::Tools::run_command(
        $cmd,
        outfunc => $record_output,
        errfunc => $record_output,
        timeout => $timeout,
        errmsg => 'sos report failed',
    );

    my $path = find_sos_archive($output, $since);
    die "generated sos report archive '$path' is empty\n" if !-s $path;

    print "PVE_SOS_REPORT_ARCHIVE: $path\n" if $opts{print_output};

    return {
        path => $path,
        filename => basename($path),
        output => $output,
    };
}

sub sos_archive_download {
    my ($path) = @_;

    die "no sos report archive path specified\n" if !defined($path);
    die "invalid sos report archive path '$path'\n"
        if $path !~ m{^/(?:var/)?tmp/sos(?:report)?-[^/\0]+\.(?:tar\.(?:xz|gz|bz2)|tgz|txz|zip)$};
    die "sos report archive '$path' does not exist\n" if !-f $path;
    die "sos report archive '$path' is empty\n" if !-s $path;

    open(my $fh, '<', $path) or die "unable to open sos report archive '$path': $!\n";
    binmode($fh);

    my $filename = basename($path);
    $filename =~ s/["\\\r\n]/_/g;

    return {
        download => {
            fh => $fh,
            stream => 1,
            'content-type' => archive_content_type($filename),
            'content-disposition' => "attachment; filename=\"$filename\"",
        },
    };
}

sub sos_archive_download_from_task {
    my ($upid, $node) = @_;

    my ($task, $filename) = PVE::Tools::upid_decode($upid, 1);
    die "unable to parse worker upid\n" if !$task;
    die "sos report task does not belong to node '$node'\n"
        if defined($node) && $task->{node} ne $node;
    die "not a sos report task\n" if $task->{type} ne 'sosreport';
    die "no such task\n" if !-f $filename;

    my $status = PVE::Tools::upid_read_status($upid);
    die "sos report task is not finished successfully: $status\n"
        if PVE::Tools::upid_status_is_error($status);

    my $log = PVE::Tools::file_get_contents($filename);
    die "unable to find sos report archive in task log\n"
        if $log !~ m/^PVE_SOS_REPORT_ARCHIVE:\s*(\/\S+)\s*$/m;

    return sos_archive_download($1);
}

1;
