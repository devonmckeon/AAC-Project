/*! server.ts
* Flamingos are pretty badass!
* Copyright (c) 2018 Max van der Schee; Licensed MIT */

import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification
} from 'vscode-languageserver';
import * as Pattern from './Patterns';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
	hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: false
			}
		}
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The server settings
interface ServerSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
const defaultSettings: ServerSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ServerSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ServerSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ServerSettings>(
			(change.settings.languageServerAccessibility || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ServerSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerAccessibility'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a HTML document has changed. This event is emitted
// when the HTML document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	//Get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);
	
	// The validator creates diagnostics for all errors and more
	let text = textDocument.getText();
	let problems = 0;
	let m: RegExpExecArray | null;
	let diagnostics: Diagnostic[] = [];
	
	while ((m = Pattern.pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		if (m != null) {
			let el = m[0].slice(0, 5);
			switch (true) {
				// Div
				case (/<div/i.test(el)):
					let resultDiv = await Pattern.validateDiv(m);
					if (resultDiv) {
						problems++;
						_diagnostics(resultDiv.meta, resultDiv.mess);
					}
					break;
				// Span
				case (/<span/i.test(el)):
					let resultSpan = await Pattern.validateSpan(m);
					if (resultSpan) {
						problems++;
						_diagnostics(resultSpan.meta, resultSpan.mess);
					}
					break;
				// Links
				case (/<a\s/i.test(el)):
					let resultA = await Pattern.validateA(m);
					if (resultA) {
						problems++;
						_diagnostics(resultA.meta, resultA.mess);
					}
					break;
				// Images
				case (/<img/i.test(el)):
					let resultImg = await Pattern.validateImg(m);
					if (resultImg) {
						problems++;
						_diagnostics(resultImg.meta, resultImg.mess);
					}
					break;
				// input
				case (/<inpu/i.test(el)):
					let resultInput = await Pattern.validateInput(m);
					if (resultInput) {
						problems++;
						_diagnostics(resultInput.meta, resultInput.mess);
					}
					break;
				// Head, title and meta
				case (/<head/i.test(el)):
					if (/<meta(?:.+?)viewport(?:.+?)>/i.test(m[0])) {
						let resultMeta = await Pattern.validateMeta(m);
						if (resultMeta) {
							problems++;
							_diagnostics(resultMeta.meta, resultMeta.mess);
						}
					}
					if (!/<title>/i.test(m[0]) || /<title>/i.test(m[0])) {
						let resultTitle = await Pattern.validateTitle(m);
						if (resultTitle) {
							problems++;
							_diagnostics(resultTitle.meta, resultTitle.mess);
						}
					}
					break;
				// HTML
				case (/<html/i.test(el)):
					let resultHtml = await Pattern.validateHtml(m);
					if (resultHtml) {
						problems++;
						_diagnostics(resultHtml.meta, resultHtml.mess);
					}
					break;
				default:
					break;
			}
		}
	}

	async function _diagnostics(regEx: RegExpExecArray, diagnosticsMessage: string) {
		let diagnosic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(regEx.index),
				end: textDocument.positionAt(regEx.index + regEx[0].length)
			},
			message: diagnosticsMessage,
			source: 'web accessibility'
		};
		
		diagnostics.push(diagnosic);
	}		
	
	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// Make the HTML document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
