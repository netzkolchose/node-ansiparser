// states replacement:
// 'GROUND' -> 'A', 0
// 'ESCAPE' -> 'B', 1
// 'ESCAPE_INTERMEDIATE' -> 'C', 2
// 'CSI_ENTRY' -> 'D', 3
// 'CSI_PARAM' -> 'E', 4
// 'CSI_INTERMEDIATE' -> 'F', 5
// 'CSI_IGNORE' -> 'G', 6
// 'SOS_PM_APC_STRING' -> 'H', 7
// 'OSC_STRING' -> 'I', 8
// 'DCS_ENTRY' -> 'J', 9
// 'DCS_PARAM' -> 'K', 10
// 'DCS_IGNORE' -> 'L', 11
// 'DCS_INTERMEDIATE' -> 'M', 12
// 'DCS_PASSTHROUGH' -> 'N' 13

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
        this.state_transitions = [{},{},{},{},{},{},{},{},{},{},{},{},{},{}];
        this.default_transition = null;
        this.inp = null;
        this.initial_state = 0;  // 'A' ('GROUND') is default
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
        this.STATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

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
        this.osc = '';
        this.printed = '';
        this.params = '';
        this.collected = '';
        this.dcs = '';
    };
    ANSIParser.prototype.add_transition = function (inp, state, action, next) {
        if (next === undefined)
            next = state;
        this.state_transitions[state][inp] = [action, next];
    };
    ANSIParser.prototype.add_transition_list = function (inps, state, action, next) {
        if (next === undefined)
            next = state;
        for (var i = 0; i < inps.length; i++)
            this.add_transition(inps[i], state, action, next);
    };
    ANSIParser.prototype.set_default_transition = function (action, next) {
        this.default_transition = [action, next];
    };
    ANSIParser.prototype.process = function (inp) {
        this.inp = inp;
        var transition = this.state_transitions[this.current_state][inp] || this.default_transition;
        this.action_ = transition[0];
        this.next_state = transition[1];
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
                case 0:
                    this.print_();
                    return;
                case 8:
                    this.osc_put();
                    this.next_state = 8;
                    return;
                case 6:
                    this.next_state = 6;
                    return;
                case 11:
                    this.next_state = 11;
                    return;
                case 13:
                    this.dcs_put();
                    this.next_state = 13;
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
            this.next_state = 1;
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
            this.next_state = 1;
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
        } else if ((this.dcs !== '') && (this.current_state == 13)) {
            this.term['inst_P'](this.dcs);
            this.dcs = '';
        }
    };

    ANSIParser.prototype.init = function () {
        this.set_default_transition(this.error_, 0);
        this.add_transition_list(PRINTABLES, 0, this.print_);
        // global anywhere rules
        for (var i = 0; i < this.STATES.length; i++) {
            this.add_transition_list(['\u0018', '\u001a', '\u0099', '\u009a'], this.STATES[i], this.execute, 0);
            this.add_transition_list(r(0x80, 0x90), this.STATES[i], this.execute, 0);
            this.add_transition_list(r(0x90, 0x98), this.STATES[i], this.execute, 0);
            this.add_transition('\u009c', this.STATES[i], null, 0);  // ST as terminator
            this.add_transition('\u001b', this.STATES[i], this.clear_, 1);  // ESC
            this.add_transition('\u009d', this.STATES[i], this.osc_start, 8);  // OSC
            this.add_transition_list(['\u0098\u009e\u009f'], this.STATES[i], null, 7);
            this.add_transition('\u009b', this.STATES[i], this.clear_, 3);  // CSI
            this.add_transition('\u0090', this.STATES[i], this.clear_, 9);  // DCS
        }
        // rules for executables and 7f
        this.add_transition_list(EXECUTABLES, 0, this.execute);
        this.add_transition_list(EXECUTABLES, 1, this.execute);
        this.add_transition('\u007f', 1);
        this.add_transition_list(EXECUTABLES, 8);
        this.add_transition_list(EXECUTABLES, 3, this.execute);
        this.add_transition('\u007f', 3);
        this.add_transition_list(EXECUTABLES, 4, this.execute);
        this.add_transition('\u007f', 4);
        this.add_transition_list(EXECUTABLES, 6, this.execute);
        this.add_transition_list(EXECUTABLES, 5, this.execute);
        this.add_transition('\u007f', 5);
        this.add_transition_list(EXECUTABLES, 2, this.execute);
        this.add_transition('\u007f', 2);
        // osc
        this.add_transition('\u005d', 1, this.osc_start, 8);
        this.add_transition_list(PRINTABLES, 8, this.osc_put);
        this.add_transition_list(['\u009c', '\u001b', '\u0018', '\u001a', '\u0007'], 8, this.osc_end, 0);
        // sos/pm/apc does really nothing for now
        this.add_transition_list(['\u0058', '\u005e', '\u005f'], 1, null, 7);
        this.add_transition_list(PRINTABLES, 7);
        this.add_transition_list(EXECUTABLES, 7);
        this.add_transition('\u009c', 7, null, 0);
        // csi entries
        this.add_transition('\u005b', 1, this.clear_, 3);
        this.add_transition_list(r(0x40, 0x7f), 3, this.csi_dispatch, 0);
        this.add_transition_list(r(0x30, 0x3a), 3, this.param, 4);
        this.add_transition('\u003b', 3, this.param, 4);
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 3, this.collect, 4);
        this.add_transition_list(r(0x30, 0x3a), 4, this.param);
        this.add_transition('\u003b', 4, this.param);
        this.add_transition_list(r(0x40, 0x7f), 4, this.csi_dispatch, 0);
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'], 4, null, 6);
        this.add_transition_list(r(0x20, 0x40), 6);
        this.add_transition('\u007f', 6);
        this.add_transition_list(r(0x40, 0x7f), 6, null, 0);
        this.add_transition('\u003a', 3, null, 6);
        this.add_transition_list(r(0x20, 0x30), 3, this.collect, 5);
        this.add_transition_list(r(0x20, 0x30), 5, this.collect);
        this.add_transition_list(r(0x30, 0x40), 5, null, 6);
        this.add_transition_list(r(0x40, 0x7f), 5, this.csi_dispatch, 0);
        this.add_transition_list(r(0x20, 0x30), 4, this.collect, 5);
        // esc_intermediate
        this.add_transition_list(r(0x20, 0x30), 1, this.collect, 2);
        this.add_transition_list(r(0x20, 0x30), 2, this.collect);
        this.add_transition_list(r(0x30, 0x7f), 2, this.esc_dispatch, 0);
        this.add_transition_list(r(0x30, 0x50), 1, this.esc_dispatch, 0);
        this.add_transition_list(['\u0051', '\u0052', '\u0053', '\u0054', '\u0055', '\u0056',
            '\u0057', '\u0059', '\u005a', '\u005c'], 1, this.esc_dispatch, 0);
        this.add_transition_list(r(0x60, 0x7f), 1, this.esc_dispatch, 0);
        // dcs entry
        this.add_transition('\u0050', 1, this.clear_, 9);
        this.add_transition_list(EXECUTABLES, 9);
        this.add_transition('\u007f', 9);
        this.add_transition_list(r(0x20, 0x30), 9, this.collect, 12);
        this.add_transition('\u003a', 9, null, 11);
        this.add_transition_list(r(0x30, 0x3a), 9, this.param, 10);
        this.add_transition('\u003b', 9, this.param, 10);
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 9, this.collect, 10);
        this.add_transition_list(EXECUTABLES, 11);
        this.add_transition_list(r(0x20, 0x80), 11);
        this.add_transition_list(EXECUTABLES, 10);
        this.add_transition('\u007f', 10);
        this.add_transition_list(r(0x30, 0x3a), 10, this.param);
        this.add_transition('\u003b', 10, this.param);
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'], 10, null, 11);
        this.add_transition_list(r(0x20, 0x30), 10, this.collect, 12);
        this.add_transition_list(EXECUTABLES, 12);
        this.add_transition('\u007f', 12);
        this.add_transition_list(r(0x20, 0x30), 12, this.collect);
        this.add_transition_list(r(0x30, 0x40), 12, null, 11);
        this.add_transition_list(r(0x40, 0x7f), 12, this.dcs_hook, 13);
        this.add_transition_list(r(0x40, 0x7f), 10, this.dcs_hook, 13);
        this.add_transition_list(r(0x40, 0x7f), 9, this.dcs_hook, 13);
        this.add_transition_list(EXECUTABLES, 13, this.dcs_put);
        this.add_transition_list(PRINTABLES, 13, this.dcs_put);
        this.add_transition('\u007f', 13);
        this.add_transition_list(['\u001b', '\u009c'], 13, this.dcs_unhook, 0);
    };

    if (typeof module !== 'undefined' && typeof module['exports'] !== 'undefined') {
        module['exports'] = ANSIParser;
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