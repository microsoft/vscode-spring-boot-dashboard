// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.vscode.spring.boot.dashboard.java.extension;

import com.google.gson.annotations.SerializedName;

public class JavaExtensionResponse{

    @SerializedName("local.server.port") 
    private Integer port;

    @SerializedName("server.servlet.context-path") 
    private String contextPath;
    
    private String status;

    public JavaExtensionResponse(Integer port, String contextPath, String status) {
        this.port = port;
        this.contextPath = contextPath;
        this.status = status;
    }

    public JavaExtensionResponse() {
    }

    public Integer getPort() {
        return port;
    }

    public String getContextPath() {
        return contextPath;
    }

    public String getStatus() {
        return status;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public void setContextPath(String contextPath) {
        this.contextPath = contextPath;
    }

    public void setStatus(String status) {
        this.status = status;
    }

}