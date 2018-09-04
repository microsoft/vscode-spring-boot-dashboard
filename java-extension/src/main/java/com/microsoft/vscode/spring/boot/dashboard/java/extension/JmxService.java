package com.microsoft.vscode.spring.boot.dashboard.java.extension;

import javax.management.InstanceNotFoundException;
import javax.management.MBeanServerConnection;
import javax.management.ObjectName;
import javax.management.remote.JMXConnector;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;

public class JmxService {

	static String getPortViaAdmin(MBeanServerConnection connection) throws Exception {
		try {
			String DEFAULT_OBJECT_NAME = "org.springframework.boot:type=Admin,name=SpringApplication";
			ObjectName objectName = new ObjectName(DEFAULT_OBJECT_NAME);

			Object o = connection.invoke(objectName,"getProperty", new String[] {"local.server.port"}, new String[] {String.class.getName()});
			return o.toString();
		}
		catch (InstanceNotFoundException e) {
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
			System.err.println("jmxurl='"+jmxurl+"'");
			try (JMXConnector jmxConnector = JMXConnectorFactory.connect(new JMXServiceURL(jmxurl), null)) {
				MBeanServerConnection connection = jmxConnector.getMBeanServerConnection();
				String port = getPortViaAdmin(connection);
				if (port!=null) {
					System.out.println(port);
				}
			}
		} catch (Exception e) {
			e.printStackTrace(); //prints on System.err
		}
		System.out.println(-1); // caller expects a port number on sysout. Use -1 as kind of error code if anything went wrong
	}
	
}
