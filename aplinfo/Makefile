
DOCDIR=/usr/share/doc/pve-manager/

TRUSTED_KEYS=				\
	proxmox-release-6.x.pubkey 	\
	proxmox-release-bullseye.pubkey	\
	proxmox-release-bookworm.gpg	\
	release@turnkeylinux.com.pubkey \
	mirrors.apqa.cn.pubkey \
	lierfang.pubkey

all:

.PHONY: install
install: aplinfo.dat aplinfo-lierfang.dat trustedkeys.gpg
	install -D -m 0644 aplinfo.dat $(DESTDIR)$(DOCDIR)/aplinfo.dat
	install -D -m 0644 aplinfo-lierfang.dat $(DESTDIR)$(DOCDIR)/aplinfo-lierfang.dat
	install -D -m 0644 trustedkeys.gpg $(DESTDIR)$(DOCDIR)/trustedkeys.gpg

.PHONY: update
update:
	rm -f aplinfo.dat aplinfo.dat.tmp aplinfo-lierfang.dat
	wget http://download.proxmox.com/images/aplinfo-pve-8.dat -O aplinfo.dat.tmp
	wget https://mirrors.lierfang.com/pxcloud/pxvirt/lxcs/aplinfo.dat.gz -O aplinfo-lierfang.dat.gz
	gunzip aplinfo-lierfang.dat.gz
	mv aplinfo.dat.tmp aplinfo.dat

trustedkeys.gpg: $(TRUSTED_KEYS)
	sq keyring join --binary -o $@.tmp *.pubkey proxmox-release-bookworm.gpg
	mv $@.tmp $@

.PHONY: clean
clean:
	rm -rf *~ aplinfo.dat.gz aplinfo.dat.asc trustedkeys.gpg
