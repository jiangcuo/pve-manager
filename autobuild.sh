#!/bin/bash
sudo apt install devscripts -y
yes | sudo mk-build-deps --install --remove
make deb
