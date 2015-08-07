(function() {
    'use strict';

    /**
     * range function for numbers [a, .., b-1]
     *
     * @param {number} a
     * @param {number} b
     * @return {Array}
     */
    function r(a, b) {
        var c = b - a;
        var arr = new Array(c);
        while (c--)
            arr[c] = --b;
        return arr;
    }

    /**
     * Add a transition to the transition table.
     *
     * @param table - table to add transition
     * @param {number} inp - input character code
     * @param {number} state - current state
     * @param {number=} action - action to be taken
     * @param {number=} next - next state
     */
    function add(table, inp, state, action, next) {
        table[state][inp] = [(action) ? action : 0, (next === undefined) ? state : next];
    }

    /**
     * Add multiple transitions to the transition table.
     *
     * @param table - table to add transition
     * @param {Array} inps - array of input character codes
     * @param {number} state - current state
     * @param {number=} action - action to be taken
     * @param {number=} next - next state
     */
    function add_list(table, inps, state, action, next) {
        for (var i = 0; i < inps.length; i++)
            add(table, inps[i], state, action, next);
    }

    /** global definition of printables and executables */
    var PRINTABLES = r(0x20, 0x7f);
    var EXECUTABLES = r(0x00, 0x18);
    EXECUTABLES.push(0x19);
    EXECUTABLES.concat(r(0x1c, 0x20));

    /**
     * create the standard transition table - used by all parser instances
     *     [state][character code] --> [action][next state]
     *
     *     - states are numbers from 0 to 13
     *     - control character codes defined from 0 to 159 (C0 and C1)
     *     - actions are numbers from 0 to 14
     *     - any higher character than 159 is handled by the 'error' action
     *
     *     states replacement:
     *          'GROUND' -> 0
     *          'ESCAPE' -> 1
     *          'ESCAPE_INTERMEDIATE' -> 2
     *          'CSI_ENTRY' -> 3
     *          'CSI_PARAM' -> 4
     *          'CSI_INTERMEDIATE' -> 5
     *          'CSI_IGNORE' -> 6
     *          'SOS_PM_APC_STRING' -> 7
     *          'OSC_STRING' -> 8
     *          'DCS_ENTRY' -> 9
     *          'DCS_PARAM' -> 10
     *          'DCS_IGNORE' -> 11
     *          'DCS_INTERMEDIATE' -> 12
     *          'DCS_PASSTHROUGH' -> 13
     *
     *     actions replacement:
     *          'no action' -> 0
     *          'error' -> 1
     *          'print' -> 2
     *          'execute' -> 3
     *          'osc_start' -> 4
     *          'osc_put' -> 5
     *          'osc_end' -> 6
     *          'csi_dispatch' -> 7
     *          'param' -> 8
     *          'collect' -> 9
     *          'esc_dispatch' -> 10
     *          'clear' -> 11
     *          'dcs_hook' -> 12
     *          'dcs_put' -> 13
     *          'dcs_unhook' -> 14
     */
    var TRANSITION_TABLE = (function() {
        var table = [];

        // table with default transition [any][any] --> [error, GROUND]
        for (var state=0; state<14; ++state) {
            var chars = [];
            for (var code=0; code<160; ++code) {
                chars.push([1, 0]);
            }
            table.push(chars);
        }

        // apply transitions
        // printables
        add_list(table, PRINTABLES, 0, 2);
        // global anywhere rules
        for (state=0; state<14; ++state) {
            add_list(table, [0x18, 0x1a, 0x99, 0x9a], state, 3, 0);
            add_list(table, r(0x80, 0x90), state, 3, 0);
            add_list(table, r(0x90, 0x98), state, 3, 0);
            add(table, 0x9c, state, 0, 0);   // ST as terminator
            add(table, 0x1b, state, 11, 1);  // ESC
            add(table, 0x9d, state, 4, 8);   // OSC
            add_list(table, [0x98, 0x9e, 0x9f], state, 0, 7);
            add(table, 0x9b, state, 11, 3);  // CSI
            add(table, 0x90, state, 11, 9);  // DCS
        }
        // rules for executables and 7f
        add_list(table, EXECUTABLES, 0, 3);
        add_list(table, EXECUTABLES, 1, 3);
        add(table, 0x7f, 1);
        add_list(table, EXECUTABLES, 8);
        add_list(table, EXECUTABLES, 3, 3);
        add(table, 0x7f, 3);
        add_list(table, EXECUTABLES, 4, 3);
        add(table, 0x7f, 4);
        add_list(table, EXECUTABLES, 6, 3);
        add_list(table, EXECUTABLES, 5, 3);
        add(table, 0x7f, 5);
        add_list(table, EXECUTABLES, 2, 3);
        add(table, 0x7f, 2);
        // osc
        add(table, 0x5d, 1, 4, 8);
        add_list(table, PRINTABLES, 8, 5);
        add(table, 0x7f, 8, 5);
        add_list(table, [0x9c, 0x1b, 0x18, 0x1a, 0x07], 8, 6, 0);
        add_list(table, r(0x1c, 0x20), 8, 0);
        // sos/pm/apc does nothing
        add_list(table, [0x58, 0x5e, 0x5f], 1, 0, 7);
        add_list(table, PRINTABLES, 7);
        add_list(table, EXECUTABLES, 7);
        add(table, 0x9c, 7, 0, 0);
        // csi entries
        add(table, 0x5b, 1, 11, 3);
        add_list(table, r(0x40, 0x7f), 3, 7, 0);
        add_list(table, r(0x30, 0x3a), 3, 8, 4);
        add(table, 0x3b, 3, 8, 4);
        add_list(table, [0x3c, 0x3d, 0x3e, 0x3f], 3, 9, 4);
        add_list(table, r(0x30, 0x3a), 4, 8);
        add(table, 0x3b, 4, 8);
        add_list(table, r(0x40, 0x7f), 4, 7, 0);
        add_list(table, [0x3a, 0x3c, 0x3d, 0x3e, 0x3f], 4, 0, 6);
        add_list(table, r(0x20, 0x40), 6);
        add(table, 0x7f, 6);
        add_list(table, r(0x40, 0x7f), 6, 0, 0);
        add(table, 0x3a, 3, 0, 6);
        add_list(table, r(0x20, 0x30), 3, 9, 5);
        add_list(table, r(0x20, 0x30), 5, 9);
        add_list(table, r(0x30, 0x40), 5, 0, 6);
        add_list(table, r(0x40, 0x7f), 5, 7, 0);
        add_list(table, r(0x20, 0x30), 4, 9, 5);
        // esc_intermediate
        add_list(table, r(0x20, 0x30), 1, 9, 2);
        add_list(table, r(0x20, 0x30), 2, 9);
        add_list(table, r(0x30, 0x7f), 2, 10, 0);
        add_list(table, r(0x30, 0x50), 1, 10, 0);
        add_list(table, [0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x59, 0x5a, 0x5c], 1, 10, 0);
        add_list(table, r(0x60, 0x7f), 1, 10, 0);
        // dcs entry
        add(table, 0x50, 1, 11, 9);
        add_list(table, EXECUTABLES, 9);
        add(table, 0x7f, 9);
        add_list(table, r(0x1c, 0x20), 9);
        add_list(table, r(0x20, 0x30), 9, 9, 12);
        add(table, 0x3a, 9, 0, 11);
        add_list(table, r(0x30, 0x3a), 9, 8, 10);
        add(table, 0x3b, 9, 8, 10);
        add_list(table, [0x3c, 0x3d, 0x3e, 0x3f], 9, 9, 10);
        add_list(table, EXECUTABLES, 11);
        add_list(table, r(0x20, 0x80), 11);
        add_list(table, r(0x1c, 0x20), 11);
        add_list(table, EXECUTABLES, 10);
        add(table, 0x7f, 10);
        add_list(table, r(0x1c, 0x20), 10);
        add_list(table, r(0x30, 0x3a), 10, 8);
        add(table, 0x3b, 10, 8);
        add_list(table, [0x3a, 0x3c, 0x3d, 0x3e, 0x3f], 10, 0, 11);
        add_list(table, r(0x20, 0x30), 10, 9, 12);
        add_list(table, EXECUTABLES, 12);
        add(table, 0x7f, 12);
        add_list(table, r(0x1c, 0x20), 12);
        add_list(table, r(0x20, 0x30), 12, 9);
        add_list(table, r(0x30, 0x40), 12, 0, 11);
        add_list(table, r(0x40, 0x7f), 12, 12, 13);
        add_list(table, r(0x40, 0x7f), 10, 12, 13);
        add_list(table, r(0x40, 0x7f), 9, 12, 13);
        add_list(table, EXECUTABLES, 13, 13);
        add_list(table, PRINTABLES, 13, 13);
        add(table, 0x7f, 13);
        add_list(table, [0x1b, 0x9c], 13, 14, 0);

        return table;
    })();

    /**
     * helper for param conversion
     * @param {string} params - params string with ;
     * @return {Array}
     */
    function parse_params(params) {
        // params are separated by ';'
        // 16 integer params max allowed
        // empty defaults to 0
        return params.split(';').slice(0, 16).map(
            function (el) {return (el) ? parseInt(el, 10) : 0});
    }


    /**
     *  AnsiParser - Parser for ANSI terminal escape sequences.
     *
     * @param {Object=} terminal
     * @constructor
     */
    function AnsiParser(terminal) {
        this.initial_state = 0;  // 'GROUND' is default
        this.current_state = this.initial_state;

        // global non pushable buffers for multiple parse invocations
        this.osc = '';
        this.params = '';
        this.collected = '';

        // back reference to terminal
        this.term = terminal || {};
        var instructions = ['inst_p', 'inst_o', 'inst_x', 'inst_c',
            'inst_e', 'inst_H', 'inst_P', 'inst_U'];
        for (var i=0; i<instructions.length; ++i)
            if (!(instructions[i] in this.term))
                this.term[instructions[i]] = function() {};
    }

    /**
     * Reset the parser.
     */
    AnsiParser.prototype.reset = function() {
        this.current_state = this.initial_state;
        this.osc = '';
        this.params = '';
        this.collected = '';
    };

    /**
     * Parse string s.
     * @param {string} s
     */
    AnsiParser.prototype.parse = function(s) {
        var c, code, transition, action, next_state;
        var current_state = this.current_state;

        // local buffers
        var printed = '';
        var dcs = '';
        var osc = this.osc;
        var collected = this.collected;
        var params = this.params;

        // process input string
        for (var i=0; i< s.length; ++i) {
            c = s.charAt(i);
            code = c.charCodeAt(0);
            transition = TRANSITION_TABLE[current_state][code] || [1, 0];
            action = transition[0];
            next_state = transition[1];
            switch (action) {
                case 0: // no action
                    break;
                case 1: // error
                    // NOTE: real error recovery is not implemented
                    // handle high unicode chars in write buffers w'o state change
                    if (code > 0x9f) {
                        switch (current_state) {
                            case 0: // GROUND -> add char to print string
                                printed += c;
                                break;
                            case 8: // OSC_STRING -> add char to osc string
                                osc += c;
                                next_state = 8;
                                break;
                            case 6: // CSI_IGNORE -> ignore char
                                next_state = 6;
                                break;
                            case 11: // DCS_IGNORE -> ignore char
                                next_state = 11;
                                break;
                            case 13: // DCS_PASSTHROUGH -> add char to dcs string
                                dcs += c;
                                next_state = 13;
                                break;
                        }
                    }
                    break;
                case 2: // print
                    printed += c;
                    break;
                case 3: // execute
                    if (printed)
                        this.term.inst_p(printed);
                    printed = '';
                    this.term.inst_x(c);
                    break;
                case 7: // csi_dispatch
                    this.term.inst_c(collected, parse_params(params), c);
                    break;
                case 8: // param
                    params += c;
                    break;
                case 9: // collect
                    collected += c;
                    break;
                case 10: // esc_dispatch
                    this.term.inst_e(collected, c);
                    break;
                case 11: // clear
                    if (printed)
                        this.term.inst_p(printed);
                    printed = '';
                    osc = '';
                    params = '';
                    collected = '';
                    dcs = '';
                    break;
                case 4: // osc_start
                    if (printed)
                        this.term.inst_p(printed);
                    printed = '';
                    osc = '';
                    break;
                case 5: // osc_put
                    osc += c;
                    break;
                case 6: // osc_end
                    if (osc && code!=0x18 && code!=0x1a)
                        this.term.inst_o(osc);
                    if (code == 0x1b)
                        next_state = 1;
                    osc = '';
                    params = '';
                    collected = '';
                    dcs = '';
                    break;
                case 12: // dcs_hook
                    this.term.inst_H(collected, parse_params(params), c);
                    break;
                case 13: // dcs_put
                    dcs += c;
                    break;
                case 14: // dcs_unhook
                    if (dcs) {
                        this.term.inst_P(dcs);
                    }
                    this.term.inst_U();
                    if (code == 0x1b)
                        next_state = 1;
                    osc = '';
                    params = '';
                    collected = '';
                    dcs = '';
                    break;
            }
            current_state = next_state;
        }

        // push leftover pushable buffers to terminal
        if (!current_state && printed) {
                this.term.inst_p(printed);
        } else if (current_state==13 && dcs) {
                this.term.inst_P(dcs);
        }

        // save non pushable buffers
        this.osc = osc;
        this.collected = collected;
        this.params = params;

        // save state
        this.current_state = current_state;
    };

    /* istanbul ignore next */
    if (typeof module !== 'undefined' && typeof module['exports'] !== 'undefined') {
        module['exports'] = AnsiParser;
    } else {
        if (typeof define === 'function' && define['amd']) {
            define([], function() {return AnsiParser;});
        } else {
            window['AnsiParser'] = AnsiParser;
        }
    }
})();