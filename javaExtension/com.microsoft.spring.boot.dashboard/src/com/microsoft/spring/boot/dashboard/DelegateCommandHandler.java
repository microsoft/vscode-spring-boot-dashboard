package com.microsoft.spring.boot.dashboard;

import java.util.List;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

import com.microsoft.spring.boot.dashboard.handler.TodoHandler;

public class DelegateCommandHandler implements IDelegateCommandHandler {
	public static String HELLO_WORLD = "vscode.spring.boot.dashboard.hello";
	public static String TODO_COMMAND = "vscode.spring.boot.dashboard.todo";
	
	@Override
	public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
		if (HELLO_WORLD.equals(commandId)) {
			return "Hello world.";
		} else if (TODO_COMMAND.equals(commandId)) {
			return new TodoHandler().process(arguments);
		}
		throw new UnsupportedOperationException(String.format("It doesn't support the command '%s'.", commandId));
	}
}
