#!/bin/bash

mvn clean package -f javaExtension/com.microsoft.spring.boot.dashboard/
mkdir -p lib
cp javaExtension/com.microsoft.spring.boot.dashboard/target/*.jar lib/
echo "Done."
