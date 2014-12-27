A parser for ANSI escape code sequences. It implements the parser described here
http://vt100.net/emu/dec_ansi_parser (thanks to Paul Williams).

The parser uses callbacks to methods of a given terminal object.

**NOTE:** If the terminal object doesnt provide the needed methods the parser
will inject dummy methods to keep working.

Methods a terminal should implement:

* inst_p(s)                         *print string s*
* inst_o(s)                         *osc call*
* inst_x(flag)                      *trigger one char method*
* inst_c(collected, params, flag)   *trigger csi method*
* inst_e(collected, flag)           *trigger esc method*
* inst_H(collected, params, flag)   *dcs command*
* inst_P(data)                      *dcs put*
* inst_U()                          *dcs leave*

## Methods

* parse(s)  *parse the given string and call the terminal methods*
* reset()   *reset the parser*

## Usage example
This example uses a simple terminal object, which just logs the actions:
```javascript
var terminal = {
    inst_p: function(s) {console.log('print', s);},
    inst_o: function(s) {console.log('osc', s);},
    inst_x: function(flag) {console.log('execute', flag.charCodeAt(0));},
    inst_c: function(collected, params, flag) {console.log('csi', collected, params, flag);},
    inst_e: function(collected, flag) {console.log('esc', collected, flag);}
};
var AnsiParser = require('node-ansiparser');
var parser = new AnsiParser(terminal);
parser.parse('\x1b[31mHello World!\n');
```
For a more complex terminal see node-ansiterminal.