// states replacement:
// 'GROUND' -> 'A',
// 'ESCAPE' -> 'B',
// 'ESCAPE_INTERMEDIATE' -> 'C',
// 'CSI_ENTRY' -> 'D',
// 'CSI_PARAM' -> 'E',
// 'CSI_INTERMEDIATE' -> 'F',
// 'CSI_IGNORE' -> 'G',
// 'SOS_PM_APC_STRING' -> 'H',
// 'OSC_STRING' -> 'I',
// 'DCS_ENTRY' -> 'J',
// 'DCS_PARAM' -> 'K',
// 'DCS_IGNORE' -> 'L',
// 'DCS_INTERMEDIATE' -> 'M',
// 'DCS_PASSTHROUGH' -> 'N'

(function() {
    'use strict';

    // decodeNum() - create unicode character from number
    function decodeNum(num) {
        return String.fromCharCode(num);
    }

    // r(start, stop) - simple range macro
    function r(a, b) {
        return SINGLES.slice(a, b);
    }

    // definition of single byte chars
    var SINGLES = new Array(256);
    for (var i = 0; i < SINGLES.length; i++)
        SINGLES[i] = i;
    SINGLES = SINGLES.map(decodeNum);

    // definitation of printables and executables
    var PRINTABLES = r(0x20, 0x7f);
    var EXECUTABLES = r(0x00, 0x18);
    EXECUTABLES.push(decodeNum(0x19));
    EXECUTABLES.concat(r(0x1c, 0x20));

    // constructor
    function ANSIParser(terminal) {
        // fsm stuff
        this.state_transitions = {};
        this.state_transitions_any = {};
        this.default_transition = null;
        this.inp = null;
        this.initial_state = 'A'; // 'A' ('GROUND') is default
        this.current_state = this.initial_state;
        this.next_state = null;
        this.action_ = null;
        this.previous_state = null;

        // terminal specific buffers
        this.osc = '';
        this.printed = '';
        this.params = '';
        this.collected = '';
        this.dcs = '';
        this.read_buf = '';
        this.STATES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

        // backreference to terminal
        this.term = terminal || {};
        var instructions = ['inst_p', 'inst_o', 'inst_x', 'inst_c',
            'inst_e', 'inst_H', 'inst_P', 'inst_U'];
        for (var i=0; i<instructions.length; ++i)
            if (!(instructions[i] in this.term)) {
                this.term[instructions[i]] = function () {
                };
            }

        // finally init all transitions
        this.init();
    }

    ANSIParser.prototype.reset = function () {
        this.current_state = this.initial_state;
        this.inp = null;
    };
    ANSIParser.prototype.add_transition = function (inp, state, action, next) {
        if (!next)
            next = state;
        this.state_transitions[[inp, state]] = [action, next];
    };
    ANSIParser.prototype.add_transition_list = function (inps, state, action, next) {
        if (!next)
            next = state;
        for (var i = 0; i < inps.length; i++)
            this.add_transition(inps[i], state, action, next);
    };
    ANSIParser.prototype.add_transition_any = function (state, action, next) {
        if (!next)
            next = state;
        this.state_transitions_any[state] = [action, next];
    };
    ANSIParser.prototype.set_default_transition = function (action, next) {
        this.default_transition = [action, next];
    };
    ANSIParser.prototype.get_transition = function (inp, state) {
        if (this.state_transitions[[inp, state]])
            return this.state_transitions[[inp, state]];
        if (this.state_transitions_any[state])
            return this.state_transitions_any[state];
        if (this.default_transition)
            return this.default_transition;
        console.error('ANSIParser: undefined transition (' + inp + ', ' + state + ')');
    };
    ANSIParser.prototype.process = function (inp) {
        this.inp = inp;
        var res = this.get_transition(this.inp, this.current_state);
        this.action_ = res[0];
        this.next_state = res[1];
        if (this.action_)
            this.action_();
        this.previous_state = this.current_state;
        this.current_state = this.next_state;
        this.next_state = null;
    };

    ANSIParser.prototype.get_params = function () {
        // params are separated by ';'
        // 16 integer params max allowed
        // empty defaults to 0
        return this.params.split(';').slice(0, 16).map(
            function (el) {
                if (!el)
                    return 0;
                return parseInt(el, 10);
            });
    };
    ANSIParser.prototype.error_ = function () {
        // handle high unicode chars according to state
        if (this.inp > '\u009f') {
            switch (this.current_state) {
                case 'A':
                    this.print_();
                    return;
                case 'I':
                    this.osc_put();
                    this.next_state = 'I';
                    return;
                case 'G':
                    this.next_state = 'G';
                    return;
                case 'L':
                    this.next_state = 'L';
                    return;
                case 'N':
                    this.dcs_put();
                    this.next_state = 'N';
                    return;
            }
            console.error('ANSIParser: unkown symbol (' + this.inp + ') in state (' + this.current_state + ')');
        }
    };
    ANSIParser.prototype.print_ = function () {
        this.printed += this.inp;
    };
    ANSIParser.prototype.execute = function () {
        if (this.printed !== '') {
            this.term['inst_p'](this.printed);
            this.printed = '';
        }
        this.term['inst_x'](this.inp);
    };
    ANSIParser.prototype.osc_start = function () {
        if (this.printed !== '') {
            this.term['inst_p'](this.printed);
            this.printed = '';
        }
    };
    ANSIParser.prototype.osc_put = function () {
        this.osc += this.inp;
    };
    ANSIParser.prototype.osc_end = function () {
        this.term['inst_o'](this.osc);
        if (this.inp == '\u001b') {
            this.clear_();
            this.next_state = 'B';
        }
    };
    ANSIParser.prototype.csi_dispatch = function () {
        this.term['inst_c'](this.collected, this.get_params(), this.inp);
    };
    ANSIParser.prototype.param = function () {
        this.params += this.inp;
    };
    ANSIParser.prototype.collect = function () {
        this.collected += this.inp;
    };
    ANSIParser.prototype.esc_dispatch = function () {
        this.term['inst_e'](this.collected, this.inp);
    };
    ANSIParser.prototype.clear_ = function () {
        this.osc = '';
        this.params = '';
        this.collected = '';
        this.dcs = '';
        this.dcs_flag = '';
        if (this.printed !== '') {
            this.term['inst_p'](this.printed);
            this.printed = '';
        }
    };
    ANSIParser.prototype.dcs_hook = function () {
        this.term['inst_H'](this.collected, this.get_params(), this.dcs_flag);
    };
    ANSIParser.prototype.dcs_put = function () {
        this.dcs += this.inp;
    };
    ANSIParser.prototype.dcs_unhook = function () {
        if (this.dcs !== '') {
            this.term['inst_P'](this.dcs);
            this.dcs = '';
        }
        this.term['inst_U']();
        if (this.inp == '\u001b') {
            this.clear_();
            this.next_state = 'B';
        }
    };

    ANSIParser.prototype.parse = function (s) {
        // process chars
        for (var i = 0; i < s.length; i++)
            this.process(s.charAt(i));
        // push leftover buffers to screen
        if (this.printed !== '') {
            this.term['inst_p'](this.printed);
            this.printed = '';
        } else if ((this.dcs !== '') && (this.current_state == 'N')) {
            this.term['inst_P'](this.dcs);
            this.dcs = '';
        }
    };

    ANSIParser.prototype.init = function () {
        this.set_default_transition(this.error_, 'A');
        this.add_transition_list(PRINTABLES, 'A', this.print_);
        // global anywhere rules
        for (var i = 0; i < this.STATES.length; i++) {
            this.add_transition_list(['\u0018', '\u001a', '\u0099', '\u009a'], this.STATES[i], this.execute, 'A');
            this.add_transition_list(r(0x80, 0x90), this.STATES[i], this.execute, 'A');
            this.add_transition_list(r(0x90, 0x98), this.STATES[i], this.execute, 'A');
            this.add_transition('\u009c', this.STATES[i], null, 'A');  // ST as terminator
            this.add_transition('\u001b', this.STATES[i], this.clear_, 'B');  // ESC
            this.add_transition('\u009d', this.STATES[i], this.osc_start, 'I');  // OSC
            this.add_transition_list(['\u0098\u009e\u009f'], this.STATES[i], null, 'H');
            this.add_transition('\u009b', this.STATES[i], this.clear_, 'D');  // CSI
            this.add_transition('\u0090', this.STATES[i], this.clear_, 'J');  // DCS
        }
        // rules for executables and 7f
        this.add_transition_list(EXECUTABLES, 'A', this.execute);
        this.add_transition_list(EXECUTABLES, 'B', this.execute);
        this.add_transition('\u007f', 'B');
        this.add_transition_list(EXECUTABLES, 'I');
        this.add_transition_list(EXECUTABLES, 'D', this.execute);
        this.add_transition('\u007f', 'D');
        this.add_transition_list(EXECUTABLES, 'E', this.execute);
        this.add_transition('\u007f', 'E');
        this.add_transition_list(EXECUTABLES, 'G', this.execute);
        this.add_transition_list(EXECUTABLES, 'F', this.execute);
        this.add_transition('\u007f', 'F');
        this.add_transition_list(EXECUTABLES, 'C', this.execute);
        this.add_transition('\u007f', 'C');
        // osc
        this.add_transition('\u005d', 'B', this.osc_start, 'I');
        this.add_transition_list(PRINTABLES, 'I', this.osc_put);
        this.add_transition_list(['\u009c', '\u001b', '\u0018', '\u001a', '\u0007'], 'I', this.osc_end, 'A');
        // sos/pm/apc does really nothing for now
        this.add_transition_list(['\u0058', '\u005e', '\u005f'], 'B', null, 'H');
        this.add_transition_list(PRINTABLES, 'H');
        this.add_transition_list(EXECUTABLES, 'H');
        this.add_transition('\u009c', 'H', null, 'A');
        // csi entries
        this.add_transition('\u005b', 'B', this.clear_, 'D');
        this.add_transition_list(r(0x40, 0x7f), 'D', this.csi_dispatch, 'A');
        this.add_transition_list(r(0x30, 0x3a), 'D', this.param, 'E');
        this.add_transition('\u003b', 'D', this.param, 'E');
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 'D', this.collect, 'E');
        this.add_transition_list(r(0x30, 0x3a), 'E', this.param);
        this.add_transition('\u003b', 'E', this.param);
        this.add_transition_list(r(0x40, 0x7f), 'E', this.csi_dispatch, 'A');
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'], 'E', null, 'G');
        this.add_transition_list(r(0x20, 0x40), 'G');
        this.add_transition('\u007f', 'G');
        this.add_transition_list(r(0x40, 0x7f), 'G', null, 'A');
        this.add_transition('\u003a', 'D', null, 'G');
        this.add_transition_list(r(0x20, 0x30), 'D', this.collect, 'F');
        this.add_transition_list(r(0x20, 0x30), 'F', this.collect);
        this.add_transition_list(r(0x30, 0x40), 'F', null, 'G');
        this.add_transition_list(r(0x40, 0x7f), 'F', this.csi_dispatch, 'A');
        this.add_transition_list(r(0x20, 0x30), 'E', this.collect, 'F');
        // esc_intermediate
        this.add_transition_list(r(0x20, 0x30), 'B', this.collect, 'C');
        this.add_transition_list(r(0x20, 0x30), 'C', this.collect);
        this.add_transition_list(r(0x30, 0x7f), 'C', this.esc_dispatch, 'A');
        this.add_transition_list(r(0x30, 0x50), 'B', this.esc_dispatch, 'A');
        this.add_transition_list(['\u0051', '\u0052', '\u0053', '\u0054', '\u0055', '\u0056',
            '\u0057', '\u0059', '\u005a', '\u005c'], 'B', this.esc_dispatch, 'A');
        this.add_transition_list(r(0x60, 0x7f), 'B', this.esc_dispatch, 'A');
        // dcs entry
        this.add_transition('\u0050', 'B', this.clear_, 'J');
        this.add_transition_list(EXECUTABLES, 'J');
        this.add_transition('\u007f', 'J');
        this.add_transition_list(r(0x20, 0x30), 'J', this.collect, 'M');
        this.add_transition('\u003a', 'J', null, 'L');
        this.add_transition_list(r(0x30, 0x3a), 'J', this.param, 'K');
        this.add_transition('\u003b', 'J', this.param, 'K');
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 'J', this.collect, 'K');
        this.add_transition_list(EXECUTABLES, 'L');
        this.add_transition_list(r(0x20, 0x80), 'L');
        this.add_transition_list(EXECUTABLES, 'K');
        this.add_transition('\u007f', 'K');
        this.add_transition_list(r(0x30, 0x3a), 'K', this.param);
        this.add_transition('\u003b', 'K', this.param);
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'], 'K', null, 'L');
        this.add_transition_list(r(0x20, 0x30), 'K', this.collect, 'M');
        this.add_transition_list(EXECUTABLES, 'M');
        this.add_transition('\u007f', 'M');
        this.add_transition_list(r(0x20, 0x30), 'M', this.collect);
        this.add_transition_list(r(0x30, 0x40), 'M', null, 'L');
        this.add_transition_list(r(0x40, 0x7f), 'M', this.dcs_hook, 'N');
        this.add_transition_list(r(0x40, 0x7f), 'K', this.dcs_hook, 'N');
        this.add_transition_list(r(0x40, 0x7f), 'J', this.dcs_hook, 'N');
        this.add_transition_list(EXECUTABLES, 'N', this.dcs_put);
        this.add_transition_list(PRINTABLES, 'N', this.dcs_put);
        this.add_transition('\u007f', 'N');
        this.add_transition_list(['\u001b', '\u009c'], 'N', this.dcs_unhook, 'A');
    };

    if (typeof module !== 'undefined' && typeof module['exports'] !== 'undefined') {
        module.exports = ANSIParser;
    } else {
        if (typeof define === 'function' && define['amd']) {
            define([], function() {
                return ANSIParser;
            });
        } else {
            window['AnsiParser'] = ANSIParser;
        }
    }
})();