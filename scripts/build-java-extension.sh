#!/bin/bash
set -e
basedir=$(pwd)
libdir=${basedir}/lib
cd java-extension
./mvnw clean package
mkdir -p ${libdir}
cp target/*.jar ${libdir}/java-extension.jar