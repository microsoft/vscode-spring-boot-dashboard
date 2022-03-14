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

public class JmxService {

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

	static String getPortViaAdmin(MBeanServerConnection connection) throws Exception {
		try {
			String DEFAULT_OBJECT_NAME = "org.springframework.boot:type=Admin,name=SpringApplication";
			ObjectName objectName = new ObjectName(DEFAULT_OBJECT_NAME);

			Object serverPortPropertyObj = connection.invoke(
					objectName,
					"getProperty",
					new String[] { "local.server.port" },
					new String[] { String.class.getName() }

			);

			return serverPortPropertyObj.toString();
		} catch (InstanceNotFoundException e) {
			return null;
		}
	}

	/**
	 * Fetch boot app's port, given a 'jmxurl' for the app. Assumes that 
	 * - boot app is running
	 * - has jmx enabled
	 * - has spring.boot admin bean enabled
	 */
	public static void main(String[] args) {
		try {
			String jmxurl = System.getProperty("jmxurl");
			try (JMXConnector jmxConnector = JMXConnectorFactory.connect(new JMXServiceURL(jmxurl), null)) {
				MBeanServerConnection connection = jmxConnector.getMBeanServerConnection();

				String port = getPropertyViaAdmin(connection, "local.server.port", String.class);
				if (port != null) {
					System.out.println("local.server.port: " + port);
				}

				String contextPath = getPropertyViaAdmin(connection, "server.servlet.context-path", String.class);
				if(contextPath != null){
					System.out.println("server.servlet.context-path: " + contextPath);
				}

			}
		} catch (Exception e) {
			e.printStackTrace(); //prints on System.err
			System.out.println(-1); // caller expects output on sysout. Use -1 as kind of error code if anything went wrong
		}
		 
	}

}
