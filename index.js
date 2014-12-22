module.exports = function() {
    // decodeNum() - create unicode character from number
    function decodeNum(num) {
        return String.fromCharCode(num);
    }

    // R(start, stop) - simple range macro
    function R(a, b) {
        return SINGLES.slice(a, b);
    }

    // definition of single byte chars
    var SINGLES = new Array(256);
    for (var i = 0; i < SINGLES.length; i++)
        SINGLES[i] = i;
    SINGLES = SINGLES.map(decodeNum);

    // definitation of printables and executables
    var PRINTABLES = R(0x20, 0x7f);
    var EXECUTABLES = R(0x00, 0x18);
    EXECUTABLES.push(decodeNum(0x19));
    EXECUTABLES.concat(R(0x1c, 0x20));

    // constructor
    function ANSIParser(terminal) {
        // fsm stuff
        this.state_transitions = {};
        this.state_transitions_any = {};
        this.default_transition = null;
        this.inp = null;
        this.initial_state = 'GROUND'; // 'GROUND' is default
        this.current_state = this.initial_state;
        this.next_state = null;
        this.action = null;
        this.previous_state = null;

        // terminal specific buffers
        this.osc = '';
        this.printed = '';
        this.params = '';
        this.collected = '';
        this.dcs = '';
        this.read_buf = '';
        this.STATES = ['GROUND', 'ESCAPE', 'ESCAPE_INTERMEDIATE', 'CSI_ENTRY',
            'CSI_PARAM', 'CSI_INTERMEDIATE', 'CSI_IGNORE',
            'SOS_PM_APC_STRING', 'OSC_STRING', 'DCS_ENTRY',
            'DCS_PARAM', 'DCS_IGNORE', 'DCS_INTERMEDIATE',
            'DCS_PASSTHROUGH'];

        // backreference to terminal
        this.term = terminal || {};
        var instructions = ['inst_p', 'inst_o', 'inst_x', 'inst_c',
            'inst_e', 'inst_H', 'inst_P', 'inst_U'];
        for (var i = 0; i < instructions.length; ++i)
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
        console.error('Transition is undefined: (' + inp + ', ' + state + ')');
    };
    ANSIParser.prototype.process = function (inp) {
        this.inp = inp;
        var res = this.get_transition(this.inp, this.current_state);
        this.action = res[0];
        this.next_state = res[1];
        if (this.action)
            this.action();
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
                return parseInt(el);
            });
    };
    ANSIParser.prototype.error = function () {
        // handle high unicode chars according to state
        if (this.inp > '\u009f') {
            switch (this.current_state) {
                case 'GROUND':
                    this.print();
                    return;
                case 'OSC_STRING':
                    this.osc_put();
                    this.next_state = 'OSC_STRING';
                    return;
                case 'CSI_IGNORE':
                    this.next_state = 'CSI_IGNORE';
                    return;
                case 'DCS_IGNORE':
                    this.next_state = 'DCS_IGNORE';
                    return;
                case 'DCS_PASSTHROUGH':
                    this.dcs_put();
                    this.next_state = 'DCS_PASSTHROUGH';
                    return;
            }
            console.error('Parser: ' + this.inp + ' unknown in state ' +
            this.current_state);
        }
    };
    ANSIParser.prototype.print = function () {
        this.printed += this.inp;
        //this.term.inst_p(this.inp);
    };
    ANSIParser.prototype.execute = function () {
        if (this.printed != '') {
            this.term.inst_p(this.printed);
            this.printed = '';
        }
        this.term.inst_x(this.inp);
    };
    ANSIParser.prototype.osc_start = function () {
        if (this.printed != '') {
            this.term.inst_p(this.printed);
            this.printed = '';
        }
    };
    ANSIParser.prototype.osc_put = function () {
        this.osc += this.inp;
    };
    ANSIParser.prototype.osc_end = function () {
        this.term.inst_o(this.osc);
        if (this.inp == '\u001b') {
            this.clear();
            this.next_state = 'ESCAPE';
        }
    };
    ANSIParser.prototype.csi_dispatch = function () {
        this.term.inst_c(this.collected, this.get_params(), this.inp);
    };
    ANSIParser.prototype.param = function () {
        this.params += this.inp;
    };
    ANSIParser.prototype.collect = function () {
        this.collected += this.inp;
    };
    ANSIParser.prototype.esc_dispatch = function () {
        this.term.inst_e(this.collected, this.inp);
    };
    ANSIParser.prototype.clear = function () {
        this.osc = '';
        this.params = '';
        this.collected = '';
        this.dcs = '';
        this.dcs_flag = '';
        if (this.printed != '') {
            this.term.inst_p(this.printed);
            this.printed = '';
        }
    };
    ANSIParser.prototype.dcs_hook = function () {
        this.term.inst_H(this.collected, this.get_params(), this.dcs_flag);
    };
    ANSIParser.prototype.dcs_put = function () {
        this.dcs += this.inp;
    };
    ANSIParser.prototype.dcs_unhook = function () {
        if (this.dcs != '') {
            this.term.inst_P(this.dcs);
            this.dcs = '';
        }
        this.term.inst_U();
        if (this.inp == '\u001b') {
            this.clear();
            this.next_state = 'ESCAPE';
        }
    };

    ANSIParser.prototype.parse = function (s) {
        // process chars
        for (var i = 0; i < s.length; i++)
            this.process(s.charAt(i));
        // push leftover buffers to screen
        if (this.printed != '') {
            this.term.inst_p(this.printed);
            this.printed = '';
        } else if ((this.dcs != '') && (this.current_state == 'DCS_PASSTHROUGH')) {
            this.term.inst_P(this.dcs);
            this.dcs = '';
        }
    };

    ANSIParser.prototype.init = function () {
        this.set_default_transition(this.error, 'GROUND');
        this.add_transition_list(PRINTABLES, 'GROUND', this.print);
        // global anywhere rules
        for (var i = 0; i < this.STATES.length; i++) {
            this.add_transition_list(['\u0018', '\u001a', '\u0099', '\u009a'], this.STATES[i],
                this.execute, 'GROUND');
            this.add_transition_list(R(0x80, 0x90), this.STATES[i], this.execute, 'GROUND');
            this.add_transition_list(R(0x90, 0x98), this.STATES[i], this.execute, 'GROUND');
            this.add_transition('\u009c', this.STATES[i], null, 'GROUND');  // ST as terminator
            this.add_transition('\u001b', this.STATES[i], this.clear, 'ESCAPE');  // ESC
            this.add_transition('\u009d', this.STATES[i], this.osc_start, 'OSC_STRING');  // OSC
            this.add_transition_list(['\u0098\u009e\u009f'], this.STATES[i], null,
                'SOS_PM_APC_STRING');
            this.add_transition('\u009b', this.STATES[i], this.clear, 'CSI_ENTRY');  // CSI
            this.add_transition('\u0090', this.STATES[i], this.clear, 'DCS_ENTRY');  // DCS
        }
        // rules for executables and 7f
        this.add_transition_list(EXECUTABLES, 'GROUND', this.execute);
        this.add_transition_list(EXECUTABLES, 'ESCAPE', this.execute);
        this.add_transition('\u007f', 'ESCAPE');
        this.add_transition_list(EXECUTABLES, 'OSC_STRING');
        this.add_transition_list(EXECUTABLES, 'CSI_ENTRY', this.execute);
        this.add_transition('\u007f', 'CSI_ENTRY');
        this.add_transition_list(EXECUTABLES, 'CSI_PARAM', this.execute);
        this.add_transition('\u007f', 'CSI_PARAM');
        this.add_transition_list(EXECUTABLES, 'CSI_IGNORE', this.execute);
        this.add_transition_list(EXECUTABLES, 'CSI_INTERMEDIATE', this.execute);
        this.add_transition('\u007f', 'CSI_INTERMEDIATE');
        this.add_transition_list(EXECUTABLES, 'ESCAPE_INTERMEDIATE', this.execute);
        this.add_transition('\u007f', 'ESCAPE_INTERMEDIATE');
        // osc
        this.add_transition('\u005d', 'ESCAPE', this.osc_start, 'OSC_STRING');
        this.add_transition_list(PRINTABLES, 'OSC_STRING', this.osc_put);
        this.add_transition_list(['\u009c', '\u001b', '\u0018', '\u001a', '\u0007'],
            'OSC_STRING', this.osc_end, 'GROUND');
        // sos/pm/apc does really nothing for now
        this.add_transition_list(['\u0058', '\u005e', '\u005f'], 'ESCAPE', null,
            'SOS_PM_APC_STRING');
        this.add_transition_list(PRINTABLES, 'SOS_PM_APC_STRING');
        this.add_transition_list(EXECUTABLES, 'SOS_PM_APC_STRING');
        this.add_transition('\u009c', 'SOS_PM_APC_STRING', null, 'GROUND');
        // csi entries
        this.add_transition('\u005b', 'ESCAPE', this.clear, 'CSI_ENTRY');
        this.add_transition_list(R(0x40, 0x7f), 'CSI_ENTRY', this.csi_dispatch, 'GROUND');
        this.add_transition_list(R(0x30, 0x3a), 'CSI_ENTRY', this.param, 'CSI_PARAM');
        this.add_transition('\u003b', 'CSI_ENTRY', this.param, 'CSI_PARAM');
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 'CSI_ENTRY',
            this.collect, 'CSI_PARAM');
        this.add_transition_list(R(0x30, 0x3a), 'CSI_PARAM', this.param);
        this.add_transition('\u003b', 'CSI_PARAM', this.param);
        this.add_transition_list(R(0x40, 0x7f), 'CSI_PARAM', this.csi_dispatch, 'GROUND');
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'],
            'CSI_PARAM', null, 'CSI_IGNORE');
        this.add_transition_list(R(0x20, 0x40), 'CSI_IGNORE');
        this.add_transition('\u007f', 'CSI_IGNORE');
        this.add_transition_list(R(0x40, 0x7f), 'CSI_IGNORE', null, 'GROUND');
        this.add_transition('\u003a', 'CSI_ENTRY', null, 'CSI_IGNORE');
        this.add_transition_list(R(0x20, 0x30), 'CSI_ENTRY', this.collect, 'CSI_INTERMEDIATE');
        this.add_transition_list(R(0x20, 0x30), 'CSI_INTERMEDIATE', this.collect);
        this.add_transition_list(R(0x30, 0x40), 'CSI_INTERMEDIATE', null, 'CSI_IGNORE');
        this.add_transition_list(R(0x40, 0x7f), 'CSI_INTERMEDIATE',
            this.csi_dispatch, 'GROUND');
        this.add_transition_list(R(0x20, 0x30), 'CSI_PARAM', this.collect, 'CSI_INTERMEDIATE');
        // esc_intermediate
        this.add_transition_list(R(0x20, 0x30), 'ESCAPE', this.collect, 'ESCAPE_INTERMEDIATE');
        this.add_transition_list(R(0x20, 0x30), 'ESCAPE_INTERMEDIATE', this.collect);
        this.add_transition_list(R(0x30, 0x7f), 'ESCAPE_INTERMEDIATE',
            this.esc_dispatch, 'GROUND');
        this.add_transition_list(R(0x30, 0x50), 'ESCAPE', this.esc_dispatch, 'GROUND');
        this.add_transition_list(['\u0051', '\u0052', '\u0053', '\u0054', '\u0055', '\u0056',
            '\u0057', '\u0059', '\u005a', '\u005c'], 'ESCAPE', this.esc_dispatch, 'GROUND');
        this.add_transition_list(R(0x60, 0x7f), 'ESCAPE', this.esc_dispatch, 'GROUND');
        // dcs entry
        this.add_transition('\u0050', 'ESCAPE', this.clear, 'DCS_ENTRY');
        this.add_transition_list(EXECUTABLES, 'DCS_ENTRY');
        this.add_transition('\u007f', 'DCS_ENTRY');
        this.add_transition_list(R(0x20, 0x30), 'DCS_ENTRY', this.collect, 'DCS_INTERMEDIATE');
        this.add_transition('\u003a', 'DCS_ENTRY', null, 'DCS_IGNORE');
        this.add_transition_list(R(0x30, 0x3a), 'DCS_ENTRY', this.param, 'DCS_PARAM');
        this.add_transition('\u003b', 'DCS_ENTRY', this.param, 'DCS_PARAM');
        this.add_transition_list(['\u003c', '\u003d', '\u003e', '\u003f'], 'DCS_ENTRY',
            this.collect, 'DCS_PARAM');
        this.add_transition_list(EXECUTABLES, 'DCS_IGNORE');
        this.add_transition_list(R(0x20, 0x80), 'DCS_IGNORE');
        this.add_transition_list(EXECUTABLES, 'DCS_PARAM');
        this.add_transition('\u007f', 'DCS_PARAM');
        this.add_transition_list(R(0x30, 0x3a), 'DCS_PARAM', this.param);
        this.add_transition('\u003b', 'DCS_PARAM', this.param);
        this.add_transition_list(['\u003a', '\u003c', '\u003d', '\u003e', '\u003f'],
            'DCS_PARAM', null, 'DCS_IGNORE');
        this.add_transition_list(R(0x20, 0x30), 'DCS_PARAM', this.collect, 'DCS_INTERMEDIATE');
        this.add_transition_list(EXECUTABLES, 'DCS_INTERMEDIATE');
        this.add_transition('\u007f', 'DCS_INTERMEDIATE');
        this.add_transition_list(R(0x20, 0x30), 'DCS_INTERMEDIATE', this.collect);
        this.add_transition_list(R(0x30, 0x40), 'DCS_INTERMEDIATE', null, 'DCS_IGNORE');
        this.add_transition_list(R(0x40, 0x7f), 'DCS_INTERMEDIATE',
            this.dcs_hook, 'DCS_PASSTHROUGH');
        this.add_transition_list(R(0x40, 0x7f), 'DCS_PARAM', this.dcs_hook, 'DCS_PASSTHROUGH');
        this.add_transition_list(R(0x40, 0x7f), 'DCS_ENTRY', this.dcs_hook, 'DCS_PASSTHROUGH');
        this.add_transition_list(EXECUTABLES, 'DCS_PASSTHROUGH', this.dcs_put);
        this.add_transition_list(PRINTABLES, 'DCS_PASSTHROUGH', this.dcs_put);
        this.add_transition('\u007f', 'DCS_PASSTHROUGH');
        this.add_transition_list(['\u001b', '\u009c'], 'DCS_PASSTHROUGH',
            this.dcs_unhook, 'GROUND');
    };

    return ANSIParser;
}();