package com.microsoft.vscode.spring.boot.dashboard.java.extension;

public class HelloWorld {

	/**
	 * Print a hello world message.
	 */
	public static void main(String[] args) {
		String name = System.getProperty("greeting.name");
		System.out.println("Hello, "+name+"!");
	}
	
}
