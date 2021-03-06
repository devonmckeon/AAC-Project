/*! server.ts
 * Flamingos are pretty badass!
 * Copyright (c) 2018 Max van der Schee; Licensed MIT */

import * as server from 'vscode-languageserver';
import * as pattern from './accessibilityPatterns';

const connection = server.createConnection(server.ProposedFeatures.all);
const documents: server.TextDocuments = new server.TextDocuments();
let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: server.InitializeParams) => {
	const capabilities = params.capabilities;

	hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
	hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
		},
	};
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		connection.client.register(server.DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders((_event) => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

interface ServerSettings {
	maxNumberOfProblems: number;
	semanticExclude: boolean;
}

const defaultSettings: ServerSettings = { maxNumberOfProblems: 100, semanticExclude: false };
let globalSettings: ServerSettings = defaultSettings;
const documentSettings: Map<string, Thenable<ServerSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
	if (hasConfigurationCapability) {
		documentSettings.clear();
	} else {
		globalSettings = <ServerSettings>(change.settings.webAccessibility || defaultSettings);
	}
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
			section: 'webAccessibility',
		});
		documentSettings.set(resource, result);
	}
	return result;
}

documents.onDidClose((e) => {
	documentSettings.delete(e.document.uri);
	connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

// Only this part is interesting.
async function validateTextDocument(textDocument: server.TextDocument): Promise<void> {
	const settings = await getDocumentSettings(textDocument.uri);
	const text = textDocument.getText();
	let problems = 0;
	let m: RegExpExecArray | null;
	const diagnostics: server.Diagnostic[] = [];

	while ((m = pattern.pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		if (m != null) {
			const el = m[0].slice(0, 5);

			const resultColor = await pattern.validateColor(m, text);
			if (resultColor) {
				problems++;
				_diagnostics(resultColor.meta, resultColor.mess, resultColor.severity);
			}

			switch (true) {
				// ID
				// case (/id="/i.test(el)):
				// 	let resultId = await pattern.validateId(m);
				// 	if (resultId) {
				// 		problems++;
				// 		_diagnostics(resultId.meta, resultId.mess);
				// 	}
				// 	break;
				// Div
				case /<div/i.test(el):
					if (settings.semanticExclude === false) {
						const resultDiv = await pattern.validateDiv(m);
						if (resultDiv) {
							problems++;
							_diagnostics(resultDiv.meta, resultDiv.mess, resultDiv.severity);
						}
					}
					break;
				// Span
				case /<span/i.test(el):
					if (settings.semanticExclude === false) {
						const resultSpan = await pattern.validateSpan(m);
						if (resultSpan) {
							problems++;
							_diagnostics(resultSpan.meta, resultSpan.mess, resultSpan.severity);
						}
					}
					break;
				// Links
				case /<a\s/i.test(el):
					const resultA = await pattern.validateA(m);
					if (resultA) {
						problems++;
						_diagnostics(resultA.meta, resultA.mess, resultA.severity);
					}
					break;
				// Images
				case /<img/i.test(el):
					const resultImg = await pattern.validateImg(m);
					if (resultImg) {
						problems++;
						_diagnostics(resultImg.meta, resultImg.mess, resultImg.severity);
					}
					break;
				// audio
				case /<audi/i.test(el):
					const resultAudio = await pattern.validateAudio(m);
					if (resultAudio) {
						problems++;
						_diagnostics(resultAudio.meta, resultAudio.mess, resultAudio.severity);
					}
					break;
				// video
				case /<vide/i.test(el):
					const resultVideo = await pattern.validateVideo(m);
					if (resultVideo) {
						problems++;
						_diagnostics(resultVideo.meta, resultVideo.mess, resultVideo.severity);
					}
					break;
				// embedded youtube
				case /youtu/i.test(el):
					const resultYouTubeVideo = await pattern.validateVideo(m);
					if (resultYouTubeVideo) {
						problems++;
						_diagnostics(resultYouTubeVideo.meta, resultYouTubeVideo.mess, resultYouTubeVideo.severity);
					}
					break;
				// input
				case /<inpu/i.test(el):
					const resultInput = await pattern.validateInput(m);
					if (resultInput) {
						problems++;
						_diagnostics(resultInput.meta, resultInput.mess, resultInput.severity);
					}
					break;
				// Head, title and meta
				case /<head/i.test(el):
					if (/<meta(?:.+?)viewport(?:.+?)>/i.test(m[0])) {
						const resultMeta = await pattern.validateMeta(m);
						if (resultMeta) {
							problems++;
							_diagnostics(resultMeta.meta, resultMeta.mess, resultMeta.severity);
						}
					}
					if (!/<title>/i.test(m[0]) || /<title>/i.test(m[0])) {
						const resultTitle = await pattern.validateTitle(m);
						if (resultTitle) {
							problems++;
							_diagnostics(resultTitle.meta, resultTitle.mess, resultTitle.severity);
						}
					}
					break;
				// HTML
				case /<html/i.test(el):
					const resultHtml = await pattern.validateHtml(m);
					if (resultHtml) {
						problems++;
						_diagnostics(resultHtml.meta, resultHtml.mess, resultHtml.severity);
					}
					break;
				// Tabindex
				case /tabin/i.test(el):
					const resultTab = await pattern.validateTab(m);
					if (resultTab) {
						problems++;
						_diagnostics(resultTab.meta, resultTab.mess, resultTab.severity);
					}
					break;
				// iframe and frame
				case /(<fram|<ifra)/i.test(el):
					const resultFrame = await pattern.validateFrame(m);
					if (resultFrame) {
						problems++;
						_diagnostics(resultFrame.meta, resultFrame.mess, resultFrame.severity);
					}
					break;
				// iframe and frame
				case /style="font-size/i.test(el):
					const resultFont = await pattern.validateFontsize(m);
					if (resultFont) {
						problems++;
						_diagnostics(resultFont.meta, resultFont.mess, resultFont.severity);
					}
					break;
				default:
					break;
			}
		}
	}

	async function _diagnostics(regEx: RegExpExecArray, diagnosticsMessage: string, severityNumber: number) {
		let severity: server.DiagnosticSeverity;

		switch (severityNumber) {
			case 1:
				severity = server.DiagnosticSeverity.Error;
				break;
			case 2:
				severity = server.DiagnosticSeverity.Warning;
				break;
			case 3:
				severity = server.DiagnosticSeverity.Information;
				break;
			case 4:
				severity = server.DiagnosticSeverity.Hint;
				break;
		}

		let diagnostic: server.Diagnostic = {
			severity,
			message: diagnosticsMessage,
			range: {
				start: textDocument.positionAt(regEx.index),
				end: textDocument.positionAt(regEx.index + regEx[0].length),
			},
			code: 0,
			source: 'web accessibility',
		};

		diagnostics.push(diagnostic);
	}
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.listen(connection);

connection.listen();
