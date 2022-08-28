function kebabCase(s) {
    return s
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}


const fs = require("fs-extra"),
    path = require('path'),
    svgstore = require("svgstore"),
    svgo = require('svgo'),
    t = require('./t');


/////////////////

// https://github.com/kardeslik/gemoji/blob/import-emoji-14/db/emoji.json
// or the main branch whenever that gets merged
const EMOJIS = require('./emoji.json');

// https://github.com/twitter/twemoji/issues/405
EMOJIS.find(e => e.emoji == '👁️‍🗨️').hotfix = '1f441-200d-1f5e8';

for(let e of EMOJIS) {
    e.category = kebabCase(e.category);
}

/////////////////

fs.ensureDirSync("./dist/individual");
fs.copySync("./twemoji/assets/svg", "./dist/individual");

console.log("Copied original files");

function optimize_and_write(path, svg) {
    svg = svg
        .replace(/path\s+id=".*?"/g, 'path') // remove all path ids
        .replace(/<!--.*?-->/g, '') // remove all comments
        ;

    svg = svgo.optimize(svg, {
        path,
        multipass: true,
        plugins: [
            {
                name: 'preset-default',
                params: {
                    overrides: {
                        // keep symbols
                        removeUselessDefs: false,
                        // keep symbol ids
                        cleanupIDs: false,
                    },
                },
            },
            'reusePaths'
        ],
    }).data;

    fs.writeFileSync(path, svg);
}

let categories = {};
let output_categories = {};

let skin_tones = [
    '', // place first for quick fallback
    "🏻",
    "🏼",
    "🏽",
    "🏾",
    "🏿",
];

function get_twemoji(e) {
    if(!t.EMOJI_RE.test(e.emoji)) {
        console.warn("Not accepted:", e.emoji);
        return;
    }

    let st = e.skin_tones ? skin_tones : [''];

    let pending = {};

    for(let tone of st) {
        let emoji = tone ? e.emoji + tone : e.emoji;

        let filename = t.normalize(emoji);

        try {
            let svg = fs.readFileSync(path.join('./twemoji/assets/svg/', (e.hotfix || filename) + '.svg')).toString();

            try {
                optimize_and_write(`./dist/individual/${filename}.svg`, svg);
            } catch(e) {
                console.error(e);
            }

            pending[emoji] = svg;
        } catch(err) {
            // if any error was thrown, it's likely because of it not finding a skin tone variant for this emoji
            // so disable those and fallback to the original
            e.skin_tones = false;
            pending = {
                // pick out the original without any modifiers
                [e.emoji]: pending[e.emoji],
            };
            break;
        }
    }

    for(let emoji in pending) {
        output_categories[e.category].add(emoji, pending[emoji]);
    }
}

for(let emoji of EMOJIS) {
    let c = categories[emoji.category];
    if(!c) {
        c = categories[emoji.category] = [];
    }
    c.push(emoji);
}

if(true) for(let category in categories) {
    output_categories[category] = svgstore();

    for(let emote of categories[category]) {
        get_twemoji(emote);
    }

    console.log("Saving category:", category);

    optimize_and_write(`./dist/${category}.svg`, output_categories[category].toString());
}

let compressed_emojis = [];
let compressed_categories = Object.keys(categories);

for(let e of EMOJIS) {
    let a = e.aliases || [];
    let c = compressed_categories.indexOf(e.category);

    // TODO: Come up with a better way to handle these
    if(e.skin_tones) {
        c *= -1;
    }

    compressed_emojis.push([e.emoji, c, ...a.sort((a, b) => b.length - a.length)].join(','));
}

// NOTE: Flattens any inner arrays as if
compressed_emojis = compressed_emojis.join('|')

fs.writeFileSync('./dist/emojis.json', JSON.stringify({
    c: compressed_categories,
    e: compressed_emojis,
}));