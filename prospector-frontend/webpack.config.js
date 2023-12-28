const path = require('path');

const sfcta_components = [
     'cmp',
     'walkskims',
     'hwyskims',
     'tnc',
       'autolos',
     'tmcshp',
     'viz-template',
     'sftraveldemand',
     'champlu',
     'tnctrn',
     'tnctrntaz',
     'hwynet',
     'csf_tt',
     'csf_jobpop',
     'csf_acc',
     'csf_pattern',
     'csf_trnload',
     'csf_vmt',
     'coc',
     'cmptest',
     'cmpqa',
     'cmp_safety',
     'cmprt',
     'losrt',
     'champtrips',
     'tnctrnfac',
     'survey2018',
	 'survey2023',
     'trnobstrips',
     'covid_scn',
   'epc'
     //'cmp-v0',
];

module.exports = {
    mode: 'development',
    //mode: 'production',
    
     entry: () => {
        let entries = {};
        for (let tool of sfcta_components) {
          entries[tool] = ['babel-polyfill', `./src/${tool}/code.js`];
        }
        return entries;
     },

     output: {
         path: path.join(__dirname, './src/bundles/'),
         filename: '[name].js'
     },

     module: {
       rules: [{
         loader: 'babel-loader',
         exclude: /node_modules/,
         options: {
           plugins: ["@babel/plugin-transform-runtime"],
           presets: [
            ["@babel/preset-env", {
                "useBuiltIns": false,
            }]
           ]
         }
       }]
     },
};
