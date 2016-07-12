[![Build Status](https://travis-ci.org/netzkolchose/node-ansiparser.svg?branch=master)](https://travis-ci.org/netzkolchose/node-ansiparser)
[![Coverage Status](https://coveralls.io/repos/netzkolchose/node-ansiparser/badge.svg?branch=master)](https://coveralls.io/r/netzkolchose/node-ansiparser?branch=master)

A parser for ANSI escape code sequences. It implements the parser described here
http://vt100.net/emu/dec_ansi_parser (thanks to Paul Williams).

**NOTE ON UNICODE:** The parser works with unicode strings. High characters (any above 0x9f)
are only allowed within the string consuming states GROUND (for print), OSC_STRING and DCS_PASSTHROUGH.
At any other state they will either be ignored (CSI_IGNORE and DCS_IGNORE)
or cancel the active escape sequence. Although this doesn't follow any official specification
(since I haven't found any) it seems to work with unicode terminal streams.

The parser uses callbacks to methods of a given terminal object.
Methods a terminal should implement:

* inst_p(s)                         *print string s*
* inst_o(s)                         *osc call*
* inst_x(flag)                      *trigger one char method*
* inst_c(collected, params, flag)   *trigger csi method*
* inst_e(collected, flag)           *trigger esc method*
* inst_H(collected, params, flag)   *dcs command (hook)*
* inst_P(data)                      *dcs put*
* inst_U()                          *dcs unhook*

**NOTE ON CALLBACK INVOCATIONS** All callbacks will be triggered as soon as the escape sequence
is finished.

The callbacks `inst_o`, `inst_x`, `inst_c`, `inst_e`, `inst_H` and
`int_U` are guaranteed to be finished. If a corresponding escape sequence is not
finished at the end of the parse input the parser will not trigger the callback until the
sequence gets finished by later `.parse` calls.

`inst_p` and `inst_P` are not guaranteed to be finished. They can occur multiple times in a row
and they will always be triggered at the end of the parse input:

* `inst_p`  - Since Javascript uses a variable multibyte encoding for high unicode characters
there is a small chance that the last character is part of a multibyte character
and not directly printable, e.g. `parse('<high byte>'); parse('<low byte>');`. To handle
it you will have to track this edge case in your terminal object.

* `inst_P` - is part of the DCS subsystem and likely to contain arbitrary length data.
To handle this with the correct DCS subparser the terminal object has to respect
the dcs_hook via `inst_H` until dcs_unhook `inst_U` is called.

Although the OSC subsystem is intended to work similar to the DCS subsystem the parser does not
expose the osc_start, osc_end and osc_put calls. The OSC use cases are well defined and
the data part is likely to be very short. Therefore the parser summarizes the OSC actions to
only one final OSC callback. OSC parsing itself is not covered by this parser.

There is an optional `inst_E(e)` callback to track parsing errors with `e` containing all internal
parser states at error time. By returning a similar object from this callback 
you can inject new values to the parsing process or abort it with `{abort:true}`.
The parser will fall to state 'GROUND' and continue with the next character
if you don't return anything (default behavior).


**NOTE:** If the terminal object doesn't provide the needed methods the parser
will inject dummy methods to keep working.


## Methods

* parse(s)  *parse the given string and call the terminal methods*
* reset()   *reset the parser*


## Usage example
This example uses a simple terminal object, which just logs the actions:
```javascript
var AnsiParser = require('node-ansiparser');

var terminal = {
    inst_p: function(s) {console.log('print', s);},
    inst_o: function(s) {console.log('osc', s);},
    inst_x: function(flag) {console.log('execute', flag.charCodeAt(0));},
    inst_c: function(collected, params, flag) {console.log('csi', collected, params, flag);},
    inst_e: function(collected, flag) {console.log('esc', collected, flag);},
    inst_H: function(collected, params, flag) {console.log('dcs-Hook', collected, params, flag);},
    inst_P: function(dcs) {console.log('dcs-Put', dcs);},
    inst_U: function() {console.log('dcs-Unhook');}
};


var parser = new AnsiParser(terminal);
parser.parse('\x1b[31mHello World!\n');
parser.parse('\x1bP0!u%5\x1b\'');
```
For a more complex terminal see [node-ansiterminal](https://github.com/netzkolchose/node-ansiterminal).


## Parser Throughput

The parser has a throughput of 50 - 100 MB/s with my desktop computer.