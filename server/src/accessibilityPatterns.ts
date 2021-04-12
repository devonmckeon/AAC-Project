/*! accessibilityPatterns.ts
 * Flamingos are pretty badass!
 * Copyright (c) 2018 Max van der Schee; Licensed MIT */
// import {
// 	createConnection,
// 	ProposedFeatures
// } from 'vscode-languageserver';

// connection is used for debuging > connection.console.log();
// let connection = createConnection(ProposedFeatures.all);

// Order based om most common types first
import { DocumentColorRequest } from 'vscode-languageserver-protocol';
import 'jsdom-global/register';

const patterns: string[] = [
	'<div(>|)(?:.)+?>',
	'<span(>|)(?:.)+?>',
	// "id=\"(?:.)+?\"",
	'<a (?:.)+?>(?:(?:\\s|\\S)+?(?=</a>))</a>',
	'<img (?:.)+?>',
	'<audio (?:.)+?>',
	'<video (?:.)+?>',
	'youtube(?:.)+?',
	'<input (?:.)+?>',
	'<head (?:.|)+?>(?:(?:\\s|\\S|)+?(?=</head>))</head>',
	'<html(>|)(?:.)+?>',
	'tabindex="(?:.)+?"',
	'<(?:i|)frame (?:.|)+?>',
	'<([a-z]+)[^>]*(?<!/)>',
];
export const pattern: RegExp = new RegExp(patterns.join('|'), 'ig');

const nonDescriptiveAlts: string[] = [
	'alt="image"',
	'alt="picture"',
	'alt="logo"',
	'alt="icon"',
	'alt="graphic"',
	'alt="an image"',
	'alt="a picture"',
	'alt="a logo"',
	'alt="an icon"',
	'alt="a graphic"',
];
const nonDescriptiveAltsTogether = new RegExp(nonDescriptiveAlts.join('|'), 'i');

const badAltStarts: string[] = [
	'alt="image of',
	'alt="picture of',
	'alt="logo of',
	'alt="icon of',
	'alt="graphic of',
	'alt="an image of',
	'alt="a picture of',
	'alt="a logo of',
	'alt="an icon of',
	'alt="a graphic of',
];
const badAltStartsTogether = new RegExp(badAltStarts.join('|'), 'i');

export async function validateDiv(m: RegExpExecArray) {
	if (!/role=(?:.*?[a-z].*?)"/i.test(m[0])) {
		return {
			meta: m,
			mess: 'Use Semantic HTML5 or specify a WAI-ARIA role [role=""]',
			severity: 3,
		};
	}
}

export async function validateSpan(m: RegExpExecArray) {
	if (!/role=(?:.*?[a-z].*?)"/i.test(m[0])) {
		if (!/<span(?:.+?)(?:aria-hidden="true)(?:.+?)>/.test(m[0])) {
			if (/<span(?:.+?)(?:button|btn)(?:.+?)>/.test(m[0])) {
				return {
					meta: m,
					mess: 'Change the span to a <button>',
					severity: 3,
				};
			} else {
				return {
					meta: m,
					mess: 'Provide a WAI-ARIA role [role=""]',
					severity: 2,
				};
			}
		}
	}
}

export async function validateA(m: RegExpExecArray) {
	let aRegEx: RegExpExecArray;
	const oldRegEx: RegExpExecArray = m;
	const filteredString = m[0].replace(/<(?:\s|\S)+?>/gi, '');
	if (!/(?:\S+?)/gi.test(filteredString)) {
		aRegEx = /<a(?:.)+?>/i.exec(oldRegEx[0]);
		aRegEx.index = oldRegEx.index;
		return {
			meta: aRegEx,
			mess: 'Provide a descriptive text in between the tags',
			severity: 2,
		};
	}
}

function luminance(r, g, b) {
	const a = [r, g, b].map(function (v) {
		v /= 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	});
	return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrast(rgb1, rgb2) {
	const lum1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
	const lum2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
	const brightest = Math.max(lum1, lum2);
	const darkest = Math.min(lum1, lum2);
	return (brightest + 0.05) / (darkest + 0.05);
}

function isInadequateContrast(color1, color2) {
	const rgb1 = color1.replace(/[^\d,]/g, '').split(',');
	const rgb2 = color2.replace(/[^\d,]/g, '').split(',');
	if (contrast(rgb1, rgb2) < 4.5) {
		return true;
	}
	return false;
}

// Needs to be cleaned up
export async function validateColor(m: RegExpExecArray, text: string) {
	const doc = document.createRange().createContextualFragment(text);
	const all = doc.querySelectorAll<HTMLElement>('*');

	for (let i = 0, max = all.length; i < max; i++) {
		let currEl = all[i];
		if (currEl.outerHTML.includes(m[0].toString())) {
			const currColor = currEl.style.color;
			if (currColor) {
				let foundParentColor = false;
				let parentColor;
				let parent;
				while (!foundParentColor) {
					parent = currEl.parentElement;
					if (parent) {
						parentColor = parent.style.backgroundColor;
						if (!parentColor) {
							currEl = parent;
						} else {
							if (parentColor) {
								if (isInadequateContrast(currColor, parentColor)) {
									return {
										meta: m,
										mess: 'Contrast between element and parent should be higher than 4.5:1',
										severity: 1,
									};
								}
								return;
							}
						}
					}
					foundParentColor = true;
				}
			}
		}
	}
}

export async function validateImg(m: RegExpExecArray) {
	// Ordered by approximate frequency of the issue
	if (!/alt="(?:.*?[a-z].*?)"/i.test(m[0]) && !/alt=""/i.test(m[0])) {
		return {
			meta: m,
			mess: 'Provide an alt text that describes the image, or alt="" if image is purely decorative',
			severity: 1,
		};
	}
	if (nonDescriptiveAltsTogether.test(m[0])) {
		return {
			meta: m,
			mess: 'Alt attribute must be specifically descriptive',
			severity: 3,
		};
	}
	if (badAltStartsTogether.test(m[0])) {
		return {
			meta: m,
			mess: 'Alt text should not begin with "image of" or similar phrasing',
			severity: 3,
		};
	}
	// Most screen readers cut off alt text at 125 characters.
	if (/alt="(?:.*?[a-z].*.{125,}?)"/i.test(m[0])) {
		return {
			meta: m,
			mess: 'Alt text is too long',
			severity: 1,
		};
	}
}

export async function validateAudio(m: RegExpExecArray) {
	return {
		meta: m,
		mess:
			'Have you provided captions or a transcript and ensured that the audio does not play automatically for more than 3 seconds?',
		severity: 2,
	};
}

export async function validateVideo(m: RegExpExecArray) {
	return {
		meta: m,
		mess: 'Have you provided open/closed captions and an audio description of the video?',
		severity: 2,
	};
}

export async function validateMeta(m: RegExpExecArray) {
	let metaRegEx: RegExpExecArray;
	const oldRegEx: RegExpExecArray = m;
	if ((metaRegEx = /<meta(?:.+?)viewport(?:.+?)>/i.exec(oldRegEx[0]))) {
		metaRegEx.index = oldRegEx.index + metaRegEx.index;
		if (!/user-scalable=yes/i.test(metaRegEx[0])) {
			return {
				meta: metaRegEx,
				mess: 'Enable pinching to zoom [user-scalable=yes]',
				severity: 3,
			};
		}
		if (/maximum-scale=1/i.test(metaRegEx[0])) {
			return {
				meta: metaRegEx,
				mess: 'Avoid using [maximum-scale=1]',
				severity: 3,
			};
		}
	}
}

export async function validateTitle(m: RegExpExecArray) {
	let titleRegEx: RegExpExecArray;
	const oldRegEx: RegExpExecArray = m;
	if (!/<title>/i.test(oldRegEx[0])) {
		titleRegEx = /<head(?:|.+?)>/i.exec(oldRegEx[0]);
		titleRegEx.index = oldRegEx.index;
		return {
			meta: titleRegEx,
			mess: 'Provide a title within the <head> tags',
			severity: 1,
		};
	} else {
		titleRegEx = /<title>(?:|.*?[a-z].*?|\s+?)<\/title>/i.exec(oldRegEx[0]);
		if (/>(?:|\s+?)</i.test(titleRegEx[0])) {
			titleRegEx.index = oldRegEx.index + titleRegEx.index;
			return {
				meta: titleRegEx,
				mess: 'Provide a text within the <title> tags',
				severity: 1,
			};
		}
	}
}

export async function validateHtml(m: RegExpExecArray) {
	if (!/lang=(?:.*?[a-z].*?)"/i.test(m[0])) {
		return {
			meta: m,
			mess: 'Provide a language [lang=""]',
			severity: 2,
		};
	}
}

export async function validateInput(m: RegExpExecArray) {
	switch (true) {
		case /type="hidden"/i.test(m[0]):
			break;
		case /aria-label=/i.test(m[0]):
			if (!/aria-label="(?:(?![a-z]*?)|\s|)"/i.test(m[0])) {
				break;
			} else {
				return {
					meta: m,
					mess: 'Provide a text within the aria label [aria-label=""]',
					severity: 3,
				};
			}
		case /id=/i.test(m[0]):
			if (/id="(?:.*?[a-z].*?)"/i.test(m[0])) {
				const idValue = /id="(.*?[a-z].*?)"/i.exec(m[0])[1];
				const pattern: RegExp = new RegExp('for="' + idValue + '"', 'i');
				if (pattern.test(m.input)) {
					break;
				} else {
					return {
						meta: m,
						mess: 'Provide an aria label [aria-label=""] or a <label for="">',
						severity: 2,
					};
				}
			} else {
				return {
					meta: m,
					mess: 'Provide an aria label [aria-label=""]',
					severity: 2,
				};
			}
		case /aria-labelledby=/i.test(m[0]):
			if (!/aria-labelledby="(?:(?![a-z]*?)|\s|)"/i.test(m[0])) {
				// TODO: needs to check elements with the same value.
				break;
			} else {
				return {
					meta: m,
					mess: 'Provide an id within the aria labelledby [aria-labelledby=""]',
					severity: 1,
				};
			}
		case /role=/i.test(m[0]):
			// TODO: needs to check if <label> is surrounded.
			break;
		default:
			return {
				meta: m,
				mess: 'Provide an aria label [aria-label=""]',
				severity: 2,
			};
	}
}

export async function validateTab(m: RegExpExecArray) {
	if (!/tabindex="(?:0|-1)"/i.test(m[0])) {
		return {
			meta: m,
			mess: 'A tabindex greater than 0 interferes with the focus order. Try restructuring the HTML',
			severity: 1,
		};
	}
}

export async function validateFrame(m: RegExpExecArray) {
	if (!/title=(?:.*?[a-z].*?)"/i.test(m[0])) {
		return {
			meta: m,
			mess: 'Provide a title that describes the frame\'s content [title=""]',
			severity: 3,
		};
	}
}

// export async function validateId(m: RegExpExecArray) {
// 	let connection = createConnection(ProposedFeatures.all);
// 	let idValue = /id="(.*?[a-z].*?)"/i.exec(m[0])[1];
// 	let pattern: RegExp = new RegExp(idValue, 'i');
// 	// connection.console.log(idValue);
// 	if (pattern.exec(m.input).length == 2) {
// 		return {
// 			meta: m,
// 			mess: 'Duplicated id'
// 		};
// 	}
// }
