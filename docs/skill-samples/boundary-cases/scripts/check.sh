#!/bin/sh
# Sample helper that ships inside the archive. DevDigest never runs it: an import reads
# SKILL.md only and lists this file as ignored.
echo "this script is not executed by DevDigest"
