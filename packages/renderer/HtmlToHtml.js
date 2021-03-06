const htmlUtils = require('./htmlUtils');
const utils = require('./utils');
// const noteStyle = require('./noteStyle').default;

// TODO: fix
// const Setting = require('@joplin/lib/models/Setting').default;
// const { themeStyle } = require('@joplin/lib/theme');
const InMemoryCache = require('./InMemoryCache').default;
const md5 = require('md5');

// Renderered notes can potentially be quite large (for example
// when they come from the clipper) so keep the cache size
// relatively small.
const inMemoryCache = new InMemoryCache(10);

class HtmlToHtml {
	constructor(options) {
		if (!options) options = {};
		this.resourceBaseUrl_ = 'resourceBaseUrl' in options ? options.resourceBaseUrl : null;
		this.ResourceModel_ = options.ResourceModel;
		this.cache_ = inMemoryCache;
		this.fsDriver_ = {
			writeFile: (/* path, content, encoding = 'base64'*/) => { throw new Error('writeFile not set'); },
			exists: (/* path*/) => { throw new Error('exists not set'); },
			cacheCssToFile: (/* cssStrings*/) => { throw new Error('cacheCssToFile not set'); },
		};

		if (options.fsDriver) {
			if (options.fsDriver.writeFile) this.fsDriver_.writeFile = options.fsDriver.writeFile;
			if (options.fsDriver.exists) this.fsDriver_.exists = options.fsDriver.exists;
			if (options.fsDriver.cacheCssToFile) this.fsDriver_.cacheCssToFile = options.fsDriver.cacheCssToFile;
		}
	}

	fsDriver() {
		return this.fsDriver_;
	}

	splitHtml(html) {
		const trimmedHtml = html.trimStart();
		if (trimmedHtml.indexOf('<style>') !== 0) return { html: html, css: '' };

		const closingIndex = trimmedHtml.indexOf('</style>');
		if (closingIndex < 0) return { html: html, css: '' };

		return {
			html: trimmedHtml.substr(closingIndex + 8),
			css: trimmedHtml.substr(7, closingIndex),
		};
	}

	async allAssets(/* theme*/) {
		return []; // TODO
	}

	// Note: the "theme" variable is ignored and instead the light theme is
	// always used for HTML notes.
	// See: https://github.com/laurent22/joplin/issues/3698
	async render(markup, _theme, options) {
		options = Object.assign({}, {
			splitted: false,
		}, options);

		const cacheKey = md5(escape(markup));
		let html = this.cache_.value(cacheKey);

		if (!html) {
			html = htmlUtils.sanitizeHtml(markup);

			html = htmlUtils.processImageTags(html, data => {
				if (!data.src) return null;

				const r = utils.imageReplacement(this.ResourceModel_, data.src, options.resources, this.resourceBaseUrl_);
				if (!r) return null;

				if (typeof r === 'string') {
					return {
						type: 'replaceElement',
						html: r,
					};
				} else {
					return {
						type: 'setAttributes',
						attrs: r,
					};
				}
			});
		}

		this.cache_.setValue(cacheKey, html, 1000 * 60 * 10);

		if (options.bodyOnly) {
			return {
				html: html,
				pluginAssets: [],
			};
		}

		// const lightTheme = themeStyle(Setting.THEME_LIGHT);
		// let cssStrings = noteStyle(lightTheme);
		let cssStrings = [];

		if (options.splitted) {
			const splitted = this.splitHtml(html);
			cssStrings = [splitted.css].concat(cssStrings);

			const output = {
				html: splitted.html,
				pluginAssets: [],
			};

			if (options.externalAssetsOnly) {
				output.pluginAssets.push(await this.fsDriver().cacheCssToFile(cssStrings));
			}

			return output;
		}

		const styleHtml = `<style>${cssStrings.join('\n')}</style>`;

		return {
			html: styleHtml + html,
			pluginAssets: [],
		};
	}
}

module.exports = HtmlToHtml;
