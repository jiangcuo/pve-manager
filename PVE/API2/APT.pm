package PVE::API2::APT;

use strict;
use warnings;

use POSIX;
use File::stat ();
use IO::File;
use File::Basename;
use Digest::SHA qw(sha1 sha1_hex);

use LWP::UserAgent;

use Proxmox::RS::APT::Repositories;

use PVE::pvecfg;
use PVE::Tools qw(extract_param);
use PVE::Cluster;
use PVE::DataCenterConfig;
use PVE::SafeSyslog;
use PVE::INotify;
use PVE::Exception;
use PVE::Notify;
use PVE::RESTHandler;
use PVE::RPCEnvironment;
use PVE::API2Tools;

use JSON;
use PVE::JSONSchema qw(get_standard_option);

my $have_aptpkg = eval {
    require AptPkg::Cache;
    require AptPkg::PkgRecords;
    require AptPkg::System;
    1;
};
my $have_apt_backend = $have_aptpkg && -x '/usr/bin/apt-get' && -e '/var/lib/dpkg/status';
my $have_rpm_backend = -x '/usr/bin/rpm' && -x '/usr/bin/dnf';

my $get_apt_cache = sub {
    die "APT backend not available on this system\n" if !$have_apt_backend;

    my $apt_cache = AptPkg::Cache->new() || die "unable to initialize AptPkg::Cache\n";

    return $apt_cache;
};

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    name => 'index',
    path => '',
    method => 'GET',
    description => "Directory index for apt (Advanced Package Tool).",
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
        type => "array",
        items => {
            type => "object",
            properties => {
                id => { type => 'string' },
            },
        },
        links => [{ rel => 'child', href => "{id}" }],
    },
    code => sub {
        my ($param) = @_;

        my $res = [
            { id => 'changelog' },
            { id => 'repositories' },
            { id => 'update' },
            { id => 'versions' },
        ];

        return $res;
    },
});

my $get_pkgfile = sub {
    my ($veriter) = @_;

    foreach my $verfile (@{ $veriter->{FileList} }) {
        my $pkgfile = $verfile->{File};
        next if !$pkgfile->{Origin};
        return $pkgfile;
    }

    return undef;
};

my $assemble_pkginfo = sub {
    my ($pkgname, $info, $current_ver, $candidate_ver) = @_;

    my $data = {
        Package => $info->{Name},
        Title => $info->{ShortDesc},
        Origin => 'unknown',
    };

    if (my $pkgfile = &$get_pkgfile($candidate_ver)) {
        $data->{Origin} = $pkgfile->{Origin};
    }

    if (my $desc = $info->{LongDesc}) {
        $desc =~ s/^.*\n\s?//; # remove first line
        $desc =~ s/\n / /g;
        $data->{Description} = $desc;
    }

    foreach my $k (qw(Section Arch Priority)) {
        $data->{$k} = $candidate_ver->{$k};
    }

    $data->{Version} = $candidate_ver->{VerStr};
    $data->{OldVersion} = $current_ver->{VerStr} if $current_ver;

    return $data;
};

my $rpm_format_evr = sub {
    my ($epoch, $version, $release) = @_;

    my $evr = $version;
    $evr .= "-$release" if defined($release) && $release ne '';

    return $evr if !defined($epoch) || $epoch eq '' || $epoch eq '0' || $epoch eq '(none)';

    return "$epoch:$evr";
};

my $run_command_capture = sub {
    my ($cmd, %param) = @_;

    my $output = "";
    my $rc = PVE::Tools::run_command(
        $cmd,
        %param,
        outfunc => sub {
            my ($line) = @_;
            $output .= "$line\n";
        },
    );

    return wantarray ? ($rc, $output) : $output;
};

my $rpm_installed_packages = sub {
    my $output = $run_command_capture->([
        'rpm',
        '-qa',
        '--qf',
        '%{NAME}\t%{EPOCHNUM}\t%{VERSION}\t%{RELEASE}\t%{ARCH}\t%{SUMMARY}\n',
    ]);

    my $installed = {};

    for my $line (split(/\n/, $output)) {
        next if $line !~ /\S/;

        my ($name, $epoch, $version, $release, $arch, $summary) = split(/\t/, $line, 6);
        next if !defined($name) || $name eq '';

        my $res = {
            Package => $name,
            Title => $summary // $name,
            Description => $summary // '',
            Origin => 'rpm',
            Section => 'rpm',
            Arch => $arch // '',
            Priority => 'optional',
            Version => $rpm_format_evr->($epoch, $version, $release),
            OldVersion => $rpm_format_evr->($epoch, $version, $release),
            CurrentState => 'Installed',
        };

        push $installed->{$name}->@*, $res;
    }

    return $installed;
};

my $rpm_lookup_installed = sub {
    my ($installed, $name, $arch) = @_;

    my $pkgs = $installed->{$name} || return undef;
    for my $pkg ($pkgs->@*) {
        return $pkg if defined($arch) && $pkg->{Arch} eq $arch;
    }

    return $pkgs->[0];
};

my $list_available_rpm_update = sub {
    my $installed = $rpm_installed_packages->();
    my $output = $run_command_capture->([
        'dnf',
        '-q',
        'repoquery',
        '--upgrades',
        '--qf',
        '%{name}\t%{epoch}\t%{version}\t%{release}\t%{arch}\t%{repoid}\t%{summary}',
    ]);

    my $pkglist = [];

    for my $line (split(/\n/, $output)) {
        next if $line !~ /\S/;

        my ($name, $epoch, $version, $release, $arch, $repoid, $summary) = split(/\t/, $line, 7);
        next if !defined($name) || $name eq '';

        my $current = $rpm_lookup_installed->($installed, $name, $arch);
        my $candidate = $rpm_format_evr->($epoch, $version, $release);

        push @$pkglist, {
            Package => $name,
            Title => $summary // $name,
            Description => $summary // '',
            Origin => $repoid // 'rpm',
            Section => 'rpm',
            Arch => $arch // '',
            Priority => 'optional',
            Version => $candidate,
            OldVersion => $current ? $current->{OldVersion} : 'unknown',
        };
    }

    return $pkglist;
};

my $rpm_db_mtime = sub {
    my $mtime = 0;

    for my $path (
        '/var/lib/rpm/Packages.db',
        '/var/lib/rpm/Index.db',
        '/usr/lib/sysimage/rpm/rpmdb.sqlite',
        '/usr/lib/sysimage/rpm/Packages.db',
        '/usr/lib/sysimage/rpm/Index.db',
    ) {
        if (my $st = File::stat::stat($path)) {
            $mtime = $st->mtime if $st->mtime > $mtime;
        }
    }

    return $mtime;
};

my $dnf_cache_mtime = sub {
    my $mtime = 0;

    for my $path ('/var/cache/dnf', '/var/lib/dnf') {
        if (my $st = File::stat::stat($path)) {
            $mtime = $st->mtime if $st->mtime > $mtime;
        }
    }

    return $mtime;
};

my $rpm_repo_files = sub {
    return [sort grep { -f $_ } glob('/etc/yum.repos.d/*.repo')];
};

my $parse_rpm_repo_file = sub {
    my ($path, $content) = @_;

    my $repos = [];
    my $current;

    my $finish = sub {
        return if !$current;

        my $uri = $current->{baseurl} // $current->{metalink} // $current->{mirrorlist} // '';
        my @uris = grep { $_ ne '' } split(/\s+/, $uri);
        my $enabled = !defined($current->{enabled}) || $current->{enabled} =~ m/^(?:1|yes|true)$/i;

        my $repo = {
            Types => ['deb'],
            URIs => \@uris,
            Suites => [$current->{id}],
            FileType => 'list',
            Enabled => $enabled ? JSON::true : JSON::false,
            Comment => $current->{name} // $current->{id},
        };

        my @options;
        for my $key (qw(gpgcheck repo_gpgcheck module_hotfixes priority cost)) {
            push @options, { Key => $key, Values => [$current->{$key}] } if defined($current->{$key});
        }
        $repo->{Options} = \@options if scalar(@options);

        push @$repos, $repo;
    };

    for my $line (split(/\n/, $content)) {
        $line =~ s/^\s+|\s+$//g;
        next if $line eq '' || $line =~ /^#/ || $line =~ /^;/;

        if ($line =~ /^\[([^\]]+)\]$/) {
            $finish->();
            $current = { id => $1 };
            next;
        }

        next if !$current;
        next if $line !~ /^([^=]+?)\s*=\s*(.*)$/;

        my ($key, $value) = (lc($1), $2);
        $key =~ s/^\s+|\s+$//g;
        $current->{$key} = $value;
    }

    $finish->();

    return $repos;
};

my $rpm_repositories = sub {
    my $files = [];
    my $errors = [];
    my $infos = [];
    my @digests;

    for my $path ($rpm_repo_files->()->@*) {
        my $content = eval { PVE::Tools::file_get_contents($path) };
        if (my $err = $@) {
            push @$errors, { path => $path, error => "$err" };
            next;
        }

        my $digest = sha1($content);
        push @digests, $digest;

        my $repos = eval { $parse_rpm_repo_file->($path, $content) };
        if (my $err = $@) {
            push @$errors, { path => $path, error => "$err" };
            next;
        }

        for my $i (0 .. $#$repos) {
            my $repo = $repos->[$i];
            my $origin = 'RPM';
            my $uri = join(' ', $repo->{URIs}->@*);
            if ($uri =~ /(?:pxvirt|lierfang)/i || ($repo->{Comment} // '') =~ /(?:pxvirt|lierfang)/i) {
                $origin = 'Lierfang';
            } elsif ($uri =~ /openeuler/i || ($repo->{Comment} // '') =~ /openeuler/i) {
                $origin = 'openEuler';
            }

            push @$infos, {
                path => $path,
                index => "$i",
                kind => 'origin',
                message => $origin,
            };
        }

        push @$files, {
            path => $path,
            'file-type' => 'list',
            repositories => $repos,
            digest => [unpack('C*', $digest)],
        };
    }

    return {
        files => $files,
        errors => $errors,
        digest => sha1_hex(join('', @digests)),
        infos => $infos,
        'standard-repos' => [],
    };
};

my $change_rpm_repository = sub {
    my ($path, $index, $enabled) = @_;

    die "invalid repository path\n" if $path !~ m|^/etc/yum\.repos\.d/[^/]+\.repo$|;
    die "repository file '$path' does not exist\n" if !-f $path;

    my $content = PVE::Tools::file_get_contents($path);
    my @lines = split(/\n/, $content, -1);
    pop @lines if scalar(@lines) && $lines[-1] eq '';

    my @sections;
    for (my $i = 0; $i < @lines; $i++) {
        if ($lines[$i] =~ /^\s*\[([^\]]+)\]\s*$/) {
            push @sections, { start => $i, id => $1 };
            $sections[-2]->{end} = $i - 1 if @sections > 1;
        }
    }
    $sections[-1]->{end} = $#lines if @sections;

    my $section = $sections[$index] // die "repository index '$index' not found in '$path'\n";
    my $wanted = defined($enabled) && int($enabled) ? 1 : 0;
    my $done = 0;

    for my $i (($section->{start} + 1) .. $section->{end}) {
        if ($lines[$i] =~ /^\s*enabled\s*=/i) {
            $lines[$i] = "enabled=$wanted";
            $done = 1;
            last;
        }
    }

    splice(@lines, $section->{start} + 1, 0, "enabled=$wanted") if !$done;

    PVE::Tools::file_set_contents($path, join("\n", @lines) . "\n");
};

my $rpm_package_versions = sub {
    my ($list, $installed) = @_;

    $installed //= $rpm_installed_packages->();

    my (undef, undef, $kernel_release) = POSIX::uname();
    my $pvever = PVE::pvecfg::version_text();
    my $seen = {};
    my $pkglist = [];

    for my $pkgname (@$list) {
        next if $seen->{$pkgname}++;

        my $res = $rpm_lookup_installed->($installed, $pkgname, undef);
        next if !$res;

        $res = { $res->%* };

        if ($pkgname eq 'pve-manager') {
            $res->{ManagerVersion} = $pvever;
        } elsif ($pkgname eq 'proxmox-ve') {
            $res->{RunningKernel} = $kernel_release;
        }

        push @$pkglist, $res;
    }

    return $pkglist;
};

# we try to cache results
my $pve_pkgstatus_fn = "/var/lib/pve-manager/pkgupdates";
my $read_cached_pkgstatus = sub {
    my $data =
        eval { decode_json(PVE::Tools::file_get_contents($pve_pkgstatus_fn, 5 * 1024 * 1024)) }
        // [];
    warn "error reading cached package status in '$pve_pkgstatus_fn' - $@\n" if $@;
    return $data;
};

my $update_pve_pkgstatus = sub {
    syslog('info', "update new package list: $pve_pkgstatus_fn");

    my $oldpkglist = &$read_cached_pkgstatus();
    my $notify_status = { map { $_->{Package} => $_->{NotifyStatus} } $oldpkglist->@* };

    my $pkglist = [];

    if (!$have_apt_backend) {
        die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

        $pkglist = $list_available_rpm_update->();

        foreach my $pi (@$pkglist) {
            if (my $ns = $notify_status->{ $pi->{Package} }) {
                $pi->{NotifyStatus} = $ns if $ns eq $pi->{Version};
            }
        }

        PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));

        return $pkglist;
    }

    my $cache = &$get_apt_cache();
    my $policy = $cache->policy;
    my $pkgrecords = $cache->packages();

    foreach my $pkgname (keys %$cache) {
        my $p = $cache->{$pkgname};
        next if !$p->{SelectedState} || ($p->{SelectedState} ne 'Install');
        my $current_ver = $p->{CurrentVer} || next;
        my $candidate_ver = $policy->candidate($p) || next;
        next if $current_ver->{VerStr} eq $candidate_ver->{VerStr};

        my $info = $pkgrecords->lookup($pkgname);
        my $res = &$assemble_pkginfo($pkgname, $info, $current_ver, $candidate_ver);
        push @$pkglist, $res;

        # also check if we need any new package
        # Note: this is just a quick hack (not recursive as it should be), because
        # I found no way to get that info from AptPkg
        my $deps = $candidate_ver->{DependsList} || next;

        my ($found, $req);
        for my $d (@$deps) {
            if ($d->{DepType} eq 'Depends') {
                $found = $d->{TargetPkg}->{SelectedState} eq 'Install' if !$found;
                # need to check ProvidesList for virtual packages
                if (!$found && (my $provides = $d->{TargetPkg}->{ProvidesList})) {
                    for my $provide ($provides->@*) {
                        $found = $provide->{OwnerPkg}->{SelectedState} eq 'Install';
                        last if $found;
                    }
                }
                $req = $d->{TargetPkg} if !$req;

                if (!($d->{CompType} & ($have_aptpkg ? AptPkg::Dep::Or() : 0))) {
                    if (!$found && $req) { # New required Package
                        my $tpname = $req->{Name};
                        my $tpinfo = $pkgrecords->lookup($tpname);
                        my $tpcv = $policy->candidate($req);
                        if ($tpinfo && $tpcv) {
                            my $res = &$assemble_pkginfo($tpname, $tpinfo, undef, $tpcv);
                            push @$pkglist, $res;
                        }
                    }
                    undef $found;
                    undef $req;
                }
            }
        }
    }

    # keep notification status (avoid sending mails abou new packages more than once)
    foreach my $pi (@$pkglist) {
        if (my $ns = $notify_status->{ $pi->{Package} }) {
            $pi->{NotifyStatus} = $ns if $ns eq $pi->{Version};
        }
    }

    PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));

    return $pkglist;
};

__PACKAGE__->register_method({
    name => 'list_updates',
    path => 'update',
    method => 'GET',
    description => "List available updates.",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Modify']],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => "array",
        items => {
            type => "object",
            properties => {},
        },
    },
    code => sub {
        my ($param) = @_;

        if (my $st1 = File::stat::stat($pve_pkgstatus_fn)) {
            if (!$have_apt_backend) {
                die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

                my $rpm_mtime = $rpm_db_mtime->();
                my $dnf_mtime = $dnf_cache_mtime->();

                if ($rpm_mtime <= $st1->mtime && $dnf_mtime <= $st1->mtime) {
                    if (my $data = &$read_cached_pkgstatus()) {
                        return $data;
                    }
                }
            } else {
                my $st2 = File::stat::stat("/var/cache/apt/pkgcache.bin");
                my $st3 = File::stat::stat("/var/lib/dpkg/status");

                if ($st2 && $st3 && $st2->mtime <= $st1->mtime && $st3->mtime <= $st1->mtime) {
                    if (my $data = &$read_cached_pkgstatus()) {
                        return $data;
                    }
                }
            }
        }

        my $pkglist = &$update_pve_pkgstatus();

        return $pkglist;
    },
});

__PACKAGE__->register_method({
    name => 'update_database',
    path => 'update',
    method => 'POST',
    description =>
        "This is used to resynchronize the package index files from their sources (apt-get update).",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Modify']],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            notify => {
                type => 'boolean',
                description => "Send notification about new packages.",
                optional => 1,
                default => 0,
            },
            quiet => {
                type => 'boolean',
                description =>
                    "Only produces output suitable for logging, omitting progress indicators.",
                optional => 1,
                default => 0,
            },
        },
    },
    returns => {
        type => 'string',
    },
    code => sub {
        my ($param) = @_;

        my $rpcenv = PVE::RPCEnvironment::get();
        my $dcconf = PVE::Cluster::cfs_read_file('datacenter.cfg');

        my $authuser = $rpcenv->get_user();

        my $realcmd = sub {
            my $upid = shift;

            if (!$have_apt_backend) {
                die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

                if ($dcconf->{http_proxy}) {
                    local $ENV{http_proxy} = $dcconf->{http_proxy};
                    local $ENV{https_proxy} = $dcconf->{http_proxy};

                    print "starting dnf makecache --refresh\n" if !$param->{quiet};

                    if ($param->{quiet}) {
                        PVE::Tools::run_command(
                            ['dnf', '-y', 'makecache', '--refresh'],
                            outfunc => sub { },
                            errfunc => sub { },
                        );
                    } else {
                        PVE::Tools::run_command(['dnf', '-y', 'makecache', '--refresh']);
                    }
                } else {
                    print "starting dnf makecache --refresh\n" if !$param->{quiet};

                    if ($param->{quiet}) {
                        PVE::Tools::run_command(
                            ['dnf', '-y', 'makecache', '--refresh'],
                            outfunc => sub { },
                            errfunc => sub { },
                        );
                    } else {
                        PVE::Tools::run_command(['dnf', '-y', 'makecache', '--refresh']);
                    }
                }
            } else {
                # setup proxy for apt

                my $aptconf = "// no proxy configured\n";
                if ($dcconf->{http_proxy}) {
                    $aptconf = "Acquire::http::Proxy \"$dcconf->{http_proxy}\";\n";
                }
                my $aptcfn = "/etc/apt/apt.conf.d/76pveproxy";
                PVE::Tools::file_set_contents($aptcfn, $aptconf);

                my $cmd = ['apt-get', 'update'];

                print "starting apt-get update\n" if !$param->{quiet};

                if ($param->{quiet}) {
                    PVE::Tools::run_command($cmd, outfunc => sub { }, errfunc => sub { });
                } else {
                    PVE::Tools::run_command($cmd);
                }
            }

            my $pkglist = &$update_pve_pkgstatus();

            if ($param->{notify} && scalar(@$pkglist)) {
                my $updates_table = {
                    schema => {
                        columns => [
                            {
                                label => "Package Name",
                                id => "package-name",
                            },
                            {
                                label => "Installed Version",
                                id => "installed-version",
                            },
                            {
                                label => "Available Version",
                                id => "available-version",
                            },
                        ],
                    },
                    data => [],
                };

                my $count = 0;
                foreach my $p (sort { $a->{Package} cmp $b->{Package} } @$pkglist) {
                    next if $p->{NotifyStatus} && $p->{NotifyStatus} eq $p->{Version};
                    $count++;

                    push @{ $updates_table->{data} },
                        {
                            "package-name" => $p->{Package},
                            "installed-version" => $p->{OldVersion},
                            "available-version" => $p->{Version},
                        };
                }

                return if !$count;

                my $template_data = PVE::Notify::common_template_data();
                $template_data->{"available-updates"} = $updates_table;

                # Additional metadata fields that can be used in notification
                # matchers.
                my $metadata_fields = {
                    type => 'package-updates',
                    # Hostname (without domain part)
                    hostname => PVE::INotify::nodename(),
                };

                PVE::Notify::info(
                    "package-updates", $template_data, $metadata_fields,
                );

                foreach my $pi (@$pkglist) {
                    $pi->{NotifyStatus} = $pi->{Version};
                }
                PVE::Tools::file_set_contents($pve_pkgstatus_fn, encode_json($pkglist));
            }

            return;
        };

        return $rpcenv->fork_worker('aptupdate', undef, $authuser, $realcmd);

    },
});

__PACKAGE__->register_method({
    name => 'changelog',
    path => 'changelog',
    method => 'GET',
    description => "Get package changelogs.",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Modify']],
    },
    proxyto => 'node',
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            name => {
                description => "Package name.",
                pattern => qr/[a-z0-9][-+.a-z0-9:]+/,
                type => 'string',
            },
            version => {
                description => "Package version.",
                type => 'string',
                optional => 1,
            },
        },
    },
    returns => {
        type => "string",
    },
    code => sub {
        my ($param) = @_;

        my $pkgname = $param->{name};

        my $cmd;
        if (!$have_apt_backend) {
            die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

            $cmd = ['dnf', '-q', 'repoquery', '--changelogs'];
            if (my $version = $param->{version}) {
                my $pkgquery = $version =~ /^[^-]+-\S+$/ ? "$pkgname-$version" : $pkgname;
                push @$cmd, $pkgquery;
            } else {
                push @$cmd, $pkgname;
            }
        } else {
            $cmd = ['apt-get', 'changelog', '-qq', '--'];
            if (my $version = $param->{version}) {
                push @$cmd, "$pkgname=$version";
            } else {
                push @$cmd, "$pkgname";
            }
        }

        my $output = "";

        my $rc = PVE::Tools::run_command(
            $cmd,
            timeout => 10,
            logfunc => sub {
                my $line = shift;
                $output .= "$line\n";
            },
            noerr => 1,
        );

        $output .= "RC: $rc" if $rc != 0;

        return $output;
    },
});

__PACKAGE__->register_method({
    name => 'repositories',
    path => 'repositories',
    method => 'GET',
    proxyto => 'node',
    description => "Get APT repository information.",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => "object",
        description => "Result from parsing the APT repository files in /etc/apt/.",
        properties => {
            files => {
                type => "array",
                description => "List of parsed repository files.",
                items => {
                    type => "object",
                    properties => {
                        path => {
                            type => "string",
                            description => "Path to the problematic file.",
                        },
                        'file-type' => {
                            type => "string",
                            enum => ['list', 'sources'],
                            description => "Format of the file.",
                        },
                        repositories => {
                            type => "array",
                            description => "The parsed repositories.",
                            items => {
                                type => "object",
                                properties => {
                                    Types => {
                                        type => "array",
                                        description => "List of package types.",
                                        items => {
                                            type => "string",
                                            enum => ['deb', 'deb-src'],
                                        },
                                    },
                                    URIs => {
                                        description => "List of repository URIs.",
                                        type => "array",
                                        items => {
                                            type => "string",
                                        },
                                    },
                                    Suites => {
                                        type => "array",
                                        description => "List of package distribuitions",
                                        items => {
                                            type => "string",
                                        },
                                    },
                                    Components => {
                                        type => "array",
                                        description => "List of repository components",
                                        optional => 1, # not present if suite is absolute
                                        items => {
                                            type => "string",
                                        },
                                    },
                                    Options => {
                                        type => "array",
                                        description => "Additional options",
                                        optional => 1,
                                        items => {
                                            type => "object",
                                            properties => {
                                                Key => {
                                                    type => "string",
                                                },
                                                Values => {
                                                    type => "array",
                                                    items => {
                                                        type => "string",
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    Comment => {
                                        type => "string",
                                        description => "Associated comment",
                                        optional => 1,
                                    },
                                    FileType => {
                                        type => "string",
                                        enum => ['list', 'sources'],
                                        description => "Format of the defining file.",
                                    },
                                    Enabled => {
                                        type => "boolean",
                                        description =>
                                            "Whether the repository is enabled or not",
                                    },
                                },
                            },
                        },
                        digest => {
                            type => "array",
                            description => "Digest of the file as bytes.",
                            items => {
                                type => "integer",
                            },
                        },
                    },
                },
            },
            errors => {
                type => "array",
                description => "List of problematic repository files.",
                items => {
                    type => "object",
                    properties => {
                        path => {
                            type => "string",
                            description => "Path to the problematic file.",
                        },
                        error => {
                            type => "string",
                            description => "The error message",
                        },
                    },
                },
            },
            digest => {
                type => "string",
                description => "Common digest of all files.",
            },
            infos => {
                type => "array",
                description => "Additional information/warnings for APT repositories.",
                items => {
                    type => "object",
                    properties => {
                        path => {
                            type => "string",
                            description => "Path to the associated file.",
                        },
                        index => {
                            type => "string",
                            description =>
                                "Index of the associated repository within the file.",
                        },
                        property => {
                            type => "string",
                            description => "Property from which the info originates.",
                            optional => 1,
                        },
                        kind => {
                            type => "string",
                            description => "Kind of the information (e.g. warning).",
                        },
                        message => {
                            type => "string",
                            description => "Information message.",
                        },
                    },
                },
            },
            'standard-repos' => {
                type => "array",
                description => "List of standard repositories and their configuration status",
                items => {
                    type => "object",
                    properties => {
                        handle => {
                            type => "string",
                            description => "Handle to identify the repository.",
                        },
                        name => {
                            type => "string",
                            description => "Full name of the repository.",
                        },
                        status => {
                            type => "boolean",
                            optional => 1,
                            description => "Indicating enabled/disabled status, if the "
                                . "repository is configured.",
                        },
                    },
                },
            },
        },
    },
    code => sub {
        my ($param) = @_;

        if (!$have_apt_backend) {
            die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;
            return $rpm_repositories->();
        }

        return Proxmox::RS::APT::Repositories::repositories("pve");
    },
});

__PACKAGE__->register_method({
    name => 'add_repository',
    path => 'repositories',
    method => 'PUT',
    description => "Add a standard repository to the configuration",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Modify']],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            handle => {
                type => 'string',
                description => "Handle that identifies a repository.",
            },
            digest => {
                type => "string",
                description => "Digest to detect modifications.",
                maxLength => 80,
                optional => 1,
            },
        },
    },
    returns => {
        type => 'null',
    },
    code => sub {
        my ($param) = @_;

        die "adding standard APT repositories is not supported on RPM systems\n"
            if !$have_apt_backend;

        Proxmox::RS::APT::Repositories::add_repository(
            $param->{handle}, "pve", $param->{digest},
        );
    },
});

__PACKAGE__->register_method({
    name => 'change_repository',
    path => 'repositories',
    method => 'POST',
    description =>
        "Change the properties of a repository. Currently only allows enabling/disabling.",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Modify']],
    },
    protected => 1,
    proxyto => 'node',
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
            path => {
                type => 'string',
                description => "Path to the containing file.",
            },
            index => {
                type => 'integer',
                description => "Index within the file (starting from 0).",
            },
            enabled => {
                type => 'boolean',
                description => "Whether the repository should be enabled or not.",
                optional => 1,
            },
            digest => {
                type => "string",
                description => "Digest to detect modifications.",
                maxLength => 80,
                optional => 1,
            },
        },
    },
    returns => {
        type => 'null',
    },
    code => sub {
        my ($param) = @_;

        my $options = {};

        my $enabled = $param->{enabled};
        $options->{enabled} = int($enabled) if defined($enabled);

        if (!$have_apt_backend) {
            die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

            $change_rpm_repository->($param->{path}, int($param->{index}), $enabled);
            return;
        }

        Proxmox::RS::APT::Repositories::change_repository(
            $param->{path},
            int($param->{index}),
            $options,
            $param->{digest},
        );
    },
});

__PACKAGE__->register_method({
    name => 'versions',
    path => 'versions',
    method => 'GET',
    proxyto => 'node',
    description => "Get package information for important Proxmox packages.",
    permissions => {
        check => ['perm', '/nodes/{node}', ['Sys.Audit']],
    },
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => "array",
        items => {
            type => "object",
            properties => {},
        },
    },
    code => sub {
        my ($param) = @_;

        # order most important things first
        my @list = qw(proxmox-ve pve-manager);

        my $installed;
        if (!$have_apt_backend) {
            die "neither APT nor RPM package backend is available\n" if !$have_rpm_backend;

            $installed = $rpm_installed_packages->();
            push @list,
                sort
                grep { /^(?:pve|proxmox)-kernel-/ }
                keys $installed->%*;
        } else {
            my $cache = &$get_apt_cache();
            my $aptver = $AptPkg::System::_system->versioning();
            my $byver = sub {
                $aptver->compare(
                    $cache->{$b}->{CurrentVer}->{VerStr},
                    $cache->{$a}->{CurrentVer}->{VerStr},
                );
            };
            push @list,
                sort $byver
                grep { /^(?:pve|proxmox)-kernel-/ && $cache->{$_}->{CurrentState} eq 'Installed' }
                keys %$cache;
        }

        my @opt_pack = qw(
            amd64-microcode
            ceph
            criu
            dnsmasq
            frr-pythontools
            gfs2-utils
            ifupdown
            ifupdown2
            intel-microcode
            ksm-control-daemon
            ksmtuned
            libpve-apiclient-perl
            libpve-network-perl
            openvswitch-switch
            proxmox-backup-file-restore
            proxmox-firewall
            proxmox-kernel-helper
            proxmox-offline-mirror-helper
            pve-esxi-import-tools
            pve-zsync
            zfsutils-linux
        );

        my @pkgs = qw(
            ceph-fuse
            corosync
            glusterfs-client
            libjs-extjs
            libknet1
            libproxmox-acme-perl
            libproxmox-backup-qemu0
            libproxmox-rs-perl
            libpve-access-control
            libpve-cluster-api-perl
            libpve-cluster-perl
            libpve-common-perl
            libpve-guest-common-perl
            libpve-http-server-perl
            livpve-notify-perl
            libpve-rs-perl
            libpve-storage-perl
            libqb0
            libspice-server1
            lvm2
            lxc-pve
            lxcfs
            novnc-pve
            proxmox-backup-client
            proxmox-backup-restore-image
            proxmox-mail-forward
            proxmox-mini-journalreader
            proxmox-widget-toolkit
            pve-cluster
            pve-container
            pve-docs
            pve-edk2-firmware
            pve-firewall
            pve-firmware
            pve-ha-manager
            pve-i18n
            pve-qemu-kvm
            pve-xtermjs
            qemu-server
            smartmontools
            spiceterm
            swtpm
            vncterm
        );

        # add the rest ordered by name, easier to find for humans
        push @list, (sort @pkgs, @opt_pack);

        if (!$have_apt_backend) {
            return $rpm_package_versions->(\@list, $installed);
        }

        my $cache = &$get_apt_cache();
        my $policy = $cache->policy;
        my $pkgrecords = $cache->packages();

        my (undef, undef, $kernel_release) = POSIX::uname();
        my $pvever = PVE::pvecfg::version_text();

        my $pkglist = [];
        foreach my $pkgname (@list) {
            my $p = $cache->{$pkgname};
            my $info = $pkgrecords->lookup($pkgname);
            my $candidate_ver = defined($p) ? $policy->candidate($p) : undef;
            my $res;
            if (my $current_ver = $p->{CurrentVer}) {
                $res = $assemble_pkginfo->(
                    $pkgname,
                    $info,
                    $current_ver,
                    $candidate_ver || $current_ver,
                );
            } elsif ($candidate_ver) {
                $res = $assemble_pkginfo->($pkgname, $info, $candidate_ver, $candidate_ver);
                delete $res->{OldVersion};
            } else {
                next;
            }
            $res->{CurrentState} = $p->{CurrentState};

            # hack: add some useful information (used by 'pveversion -v')
            if ($pkgname eq 'pve-manager') {
                $res->{ManagerVersion} = $pvever;
            } elsif ($pkgname eq 'proxmox-ve') {
                $res->{RunningKernel} = $kernel_release;
            }
            if (grep(/^$pkgname$/, @opt_pack)) {
                next if $res->{CurrentState} eq 'NotInstalled';
            }

            push @$pkglist, $res;
        }

        return $pkglist;
    },
});

1;
