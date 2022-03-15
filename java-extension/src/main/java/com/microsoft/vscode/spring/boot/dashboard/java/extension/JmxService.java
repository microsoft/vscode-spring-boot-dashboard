// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.microsoft.vscode.spring.boot.dashboard.java.extension;

import java.util.Objects;

import javax.management.InstanceNotFoundException;
import javax.management.MBeanServerConnection;
import javax.management.ObjectName;
import javax.management.remote.JMXConnector;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

public class JmxService {

	private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();
	
	private static final String ADMIN_DEFAULT_OBJECT_NAME = "org.springframework.boot:type=Admin,name=SpringApplication";

	private static String getPropertyViaAdmin(MBeanServerConnection connection, String propertyName, Class<?> propertyType) throws Exception {
		try{
			final ObjectName objectName = new ObjectName(ADMIN_DEFAULT_OBJECT_NAME);

			Object propertyObj = connection.invoke(
					objectName,
					"getProperty",
					new String[] {propertyName },
					new String[] {propertyType.getName() }

			);

			return Objects.toString(propertyObj, null);

		}catch(InstanceNotFoundException ex){
			return null;
		}
	}

	/**
	 * Fetch the boot app's properties, given a 'jmxurl' for the app. Assumes that 
	 * - boot app is running
	 * - has jmx enabled
	 * - has spring.boot admin bean enabled
	 */
	public static void main(String[] args) {
		JavaExtensionResponse responseObj = new JavaExtensionResponse();
		try {
			String jmxurl = System.getProperty("jmxurl");
			try (JMXConnector jmxConnector = JMXConnectorFactory.connect(new JMXServiceURL(jmxurl), null)) {
				MBeanServerConnection connection = jmxConnector.getMBeanServerConnection();

				String port = getPropertyViaAdmin(connection, "local.server.port", String.class);
				if (port != null) {
					responseObj.setPort(Integer.parseInt(port));
				}

				String contextPath = getPropertyViaAdmin(connection, "server.servlet.context-path", String.class);
				if(contextPath != null){
					responseObj.setContextPath(contextPath);
				}

				responseObj.setStatus("ok");

			}
		} catch (Exception e) {
			e.printStackTrace(); //prints on System.err
			responseObj.setStatus("failure"); // Use "status":"failure" as kind of error code if anything went wrong
		}

		final String responseJson = gson.toJson(responseObj);
		System.out.println(responseJson);
		 
	}

}
