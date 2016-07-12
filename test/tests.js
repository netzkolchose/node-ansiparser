if (typeof module !== 'undefined' && module.exports) {
    var chai = require('chai');
    var AnsiParser = require('../dist/ansiparser.js');
}

function r(a, b) {
    var c = b - a,
        arr = new Array(c);
    while (c--) {
        arr[c] = String.fromCharCode(--b);
    }
    return arr;
}

var test_terminal = {
    calls: [],
    clear: function () {
        this.calls = [];
    },
    compare: function (value) {
        chai.expect(this.calls.slice()).eql(value); // weird bug w'o slicing here
    },
    inst_p: function (s) {
        this.calls.push(['print', s]);
    },
    inst_o: function (s) {
        this.calls.push(['osc', s]);
    },
    inst_x: function (flag) {
        this.calls.push(['exe', flag]);
    },
    inst_c: function (collected, params, flag) {
        this.calls.push(['csi', collected, params, flag]);
    },
    inst_e: function (collected, flag) {
        this.calls.push(['esc', collected, flag]);
    },
    inst_H: function (collected, params, flag) {
        this.calls.push(['dcs hook', collected, params, flag]);
    },
    inst_P: function (dcs) {
        this.calls.push(['dcs put', dcs]);
    },
    inst_U: function () {
        this.calls.push(['dcs unhook']);
    }
};

var parser = new AnsiParser(test_terminal);

describe('Parser init and methods', function() {
    it('parser init', function () {
        var p = new AnsiParser();
        chai.expect(p.term).a('object');
        chai.expect(p.term.inst_p).a('function');
        chai.expect(p.term.inst_o).a('function');
        chai.expect(p.term.inst_x).a('function');
        chai.expect(p.term.inst_c).a('function');
        chai.expect(p.term.inst_e).a('function');
        chai.expect(p.term.inst_H).a('function');
        chai.expect(p.term.inst_P).a('function');
        chai.expect(p.term.inst_U).a('function');
        p.parse('\x1b[31mHello World!');
    });
    it('terminal callbacks', function () {
        chai.expect(parser.term).equal(test_terminal);
        chai.expect(parser.term.inst_p).equal(test_terminal.inst_p);
        chai.expect(parser.term.inst_o).equal(test_terminal.inst_o);
        chai.expect(parser.term.inst_x).equal(test_terminal.inst_x);
        chai.expect(parser.term.inst_c).equal(test_terminal.inst_c);
        chai.expect(parser.term.inst_e).equal(test_terminal.inst_e);
        chai.expect(parser.term.inst_H).equal(test_terminal.inst_H);
        chai.expect(parser.term.inst_P).equal(test_terminal.inst_P);
        chai.expect(parser.term.inst_U).equal(test_terminal.inst_U);
    });
    it('inital states', function () {
        chai.expect(parser.initial_state).equal(0);
        chai.expect(parser.current_state).equal(0);
        chai.expect(parser.osc).equal('');
        chai.expect(parser.params).eql([0]);
        chai.expect(parser.collected).equal('');
    });
    it('reset states', function () {
        parser.current_state = '#';
        parser.osc = '#';
        parser.params = [123];
        parser.collected = '#';

        parser.reset();
        chai.expect(parser.current_state).equal(0);
        chai.expect(parser.osc).equal('');
        chai.expect(parser.params).eql([0]);
        chai.expect(parser.collected).equal('');
    });
});

describe('state transitions and actions', function() {
    it('state GROUND execute action', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 0;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state GROUND print action', function () {
        parser.reset();
        test_terminal.clear();
        var printables = r(0x20, 0x7f); // NOTE: DEL excluded
        for (var i=0; i<printables.length; ++i) {
            parser.current_state = 0;
            parser.parse(printables[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['print', printables[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans ANYWHERE --> GROUND with actions', function () {
        var exes = [
            '\x18', '\x1a',
            '\x80', '\x81', '\x82', '\x83', '\x84', '\x85', '\x86', '\x87', '\x88',
            '\x89', '\x8a', '\x8b', '\x8c', '\x8d', '\x8e', '\x8f',
            '\x91', '\x92', '\x93', '\x94', '\x95', '\x96', '\x97', '\x99', '\x9a'
        ];
        var exceptions = {
            8: {'\x18': [], '\x1a': []} // simply abort osc state
        };
        parser.reset();
        test_terminal.clear();
        for (var state=0; state<14; ++state) {
            for (var i = 0; i<exes.length; ++i) {
                parser.current_state = state;
                parser.parse(exes[i]);
                chai.expect(parser.current_state).equal(0);
                test_terminal.compare(((exceptions[state]) ? exceptions[state][exes[i]] : 0) || [['exe', exes[i]]]);
                parser.reset();
                test_terminal.clear();
            }
            parser.parse('\x9c');
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans ANYWHERE --> ESCAPE with clear', function () {
        parser.reset();
        for (var state=0; state<14; ++state) {
            parser.current_state = state;
            parser.osc = '#';
            parser.params = [23];
            parser.collected = '#';
            parser.parse('\x1b');
            chai.expect(parser.current_state).equal(1);
            chai.expect(parser.osc).equal('');
            chai.expect(parser.params).eql([0]);
            chai.expect(parser.collected).equal('');
            parser.reset();
        }
    });
    it('state ESCAPE execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 1;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(1);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state ESCAPE ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 1;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(1);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('trans ESCAPE --> GROUND with ecs_dispatch action', function () {
        parser.reset();
        test_terminal.clear();
        var dispatches = r(0x30, 0x50);
        dispatches.concat(r(0x51, 0x58));
        dispatches.concat(['\x59', '\x5a', '\x5c']);
        dispatches.concat(r(0x60, 0x7f));
        for (var i=0; i<dispatches.length; ++i) {
            parser.current_state = 1;
            parser.parse(dispatches[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['esc', '', dispatches[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans ESCAPE --> ESCAPE_INTERMEDIATE with collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 1;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(2);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state ESCAPE_INTERMEDIATE execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 2;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(2);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state ESCAPE_INTERMEDIATE ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 2;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(2);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('state ESCAPE_INTERMEDIATE collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 2;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(2);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('trans ESCAPE_INTERMEDIATE --> GROUND with esc_dispatch action', function () {
        parser.reset();
        test_terminal.clear();
        var collect = r(0x30, 0x7f);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 2;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['esc', '', collect[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans ANYWHERE/ESCAPE --> CSI_ENTRY with clear', function () {
        parser.reset();
        // C0
        parser.current_state = 1;
        parser.osc = '#';
        parser.params = [123];
        parser.collected = '#';
        parser.parse('[');
        chai.expect(parser.current_state).equal(3);
        chai.expect(parser.osc).equal('');
        chai.expect(parser.params).eql([0]);
        chai.expect(parser.collected).equal('');
        parser.reset();
        // C1
        for (var state=0; state<14; ++state) {
            parser.current_state = state;
            parser.osc = '#';
            parser.params = [123];
            parser.collected = '#';
            parser.parse('\x9b');
            chai.expect(parser.current_state).equal(3);
            chai.expect(parser.osc).equal('');
            chai.expect(parser.params).eql([0]);
            chai.expect(parser.collected).equal('');
            parser.reset();
        }
    });
    it('state CSI_ENTRY execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 3;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(3);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state CSI_ENTRY ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 3;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(3);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('trans CSI_ENTRY --> GROUND with csi_dispatch action', function () {
        parser.reset();
        var dispatches = r(0x40, 0x7f);
        for (var i=0; i<dispatches.length; ++i) {
            parser.current_state = 3;
            parser.parse(dispatches[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['csi', '', [0], dispatches[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans CSI_ENTRY --> CSI_PARAM with param/collect actions', function () {
        parser.reset();
        var params = ['\x30', '\x31', '\x32', '\x33', '\x34', '\x35', '\x36', '\x37', '\x38', '\x39'];
        var collect = ['\x3c', '\x3d', '\x3e', '\x3f'];
        for (var i=0; i<params.length; ++i) {
            parser.current_state = 3;
            parser.parse(params[i]);
            chai.expect(parser.current_state).equal(4);
            chai.expect(parser.params).eql([params[i].charCodeAt(0)-48]);
            parser.reset();
        }
        // ';'
        parser.current_state = 3;
        parser.parse('\x3b');
        chai.expect(parser.current_state).equal(4);
        chai.expect(parser.params).eql([0,0]);
        parser.reset();
        for (i=0; i<collect.length; ++i) {
            parser.current_state = 3;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(4);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state CSI_PARAM execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 4;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(4);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state CSI_PARAM param action', function () {
        parser.reset();
        var params = ['\x30', '\x31', '\x32', '\x33', '\x34', '\x35', '\x36', '\x37', '\x38', '\x39'];
        for (var i=0; i<params.length; ++i) {
            parser.current_state = 4;
            parser.parse(params[i]);
            chai.expect(parser.current_state).equal(4);
            chai.expect(parser.params).eql([params[i].charCodeAt(0)-48]);
            parser.reset();
        }
        parser.current_state = 4;
        parser.parse('\x3b');
        chai.expect(parser.current_state).equal(4);
        chai.expect(parser.params).eql([0,0]);
        parser.reset();
    });
    it('state CSI_PARAM ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 4;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(4);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('trans CSI_PARAM --> GROUND with csi_dispatch action', function () {
        parser.reset();
        var dispatches = r(0x40, 0x7f);
        for (var i=0; i<dispatches.length; ++i) {
            parser.current_state = 4;
            parser.params = [0, 1];
            parser.parse(dispatches[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['csi', '', [0, 1], dispatches[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans CSI_ENTRY --> CSI_INTERMEDIATE with collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 3;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(5);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('trans CSI_PARAM --> CSI_INTERMEDIATE with collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 4;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(5);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state CSI_INTERMEDIATE execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 5;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(5);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state CSI_INTERMEDIATE collect', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 5;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(5);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state CSI_INTERMEDIATE ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 5;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(5);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('trans CSI_INTERMEDIATE --> GROUND with csi_dispatch action', function () {
        parser.reset();
        var dispatches = r(0x40, 0x7f);
        for (var i=0; i<dispatches.length; ++i) {
            parser.current_state = 5;
            parser.params = [0,1];
            parser.parse(dispatches[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([['csi', '', [0, 1], dispatches[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans CSI_ENTRY --> CSI_IGNORE', function () {
        parser.reset();
        parser.current_state = 3;
        parser.parse('\x3a');
        chai.expect(parser.current_state).equal(6);
        parser.reset();
    });
    it('trans CSI_PARAM --> CSI_IGNORE', function () {
        parser.reset();
        var chars = ['\x3a', '\x3c', '\x3d', '\x3e', '\x3f'];
        for (var i=0; i<chars.length; ++i) {
            parser.current_state = 4;
            parser.parse('\x3b' + chars[i]);
            chai.expect(parser.current_state).equal(6);
            chai.expect(parser.params).eql([0,0]);
            parser.reset();
        }
    });
    it('trans CSI_INTERMEDIATE --> CSI_IGNORE', function () {
        parser.reset();
        var chars = r(0x30, 0x40);
        for (var i=0; i<chars.length; ++i) {
            parser.current_state = 5;
            parser.parse(chars[i]);
            chai.expect(parser.current_state).equal(6);
            chai.expect(parser.params).eql([0]);
            parser.reset();
        }
    });
    it('state CSI_IGNORE execute rules', function () {
        parser.reset();
        test_terminal.clear();
        var exes = r(0x00, 0x18);
        exes.concat(['\x19']);
        exes.concat(r(0x1c, 0x20));
        for (var i=0; i<exes.length; ++i) {
            parser.current_state = 6;
            parser.parse(exes[i]);
            chai.expect(parser.current_state).equal(6);
            test_terminal.compare([['exe', exes[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state CSI_IGNORE ignore', function () {
        parser.reset();
        test_terminal.clear();
        var ignored = r(0x20, 0x40);
        ignored.concat(['\x7f']);
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 6;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(6);
            test_terminal.compare([]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans CSI_IGNORE --> GROUND', function () {
        parser.reset();
        var dispatches = r(0x40, 0x7f);
        for (var i=0; i<dispatches.length; ++i) {
            parser.current_state = 6;
            parser.params = ';1';
            parser.parse(dispatches[i]);
            chai.expect(parser.current_state).equal(0);
            test_terminal.compare([]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans ANYWHERE/ESCAPE --> SOS_PM_APC_STRING', function () {
        parser.reset();
        // C0
        var initializers = ['\x58', '\x5e', '\x5f'];
        for (i=0; i<initializers.length; ++i) {
            parser.parse('\x1b' + initializers[i]);
            chai.expect(parser.current_state).equal(7);
            parser.reset();
        }
        // C1
        for (var state=0; state<14; ++state) {
            parser.current_state = state;
            initializers = ['\x98', '\x9e', '\x9f'];
            for (var i = 0; i < initializers.length; ++i) {
                parser.parse(initializers[i]);
                chai.expect(parser.current_state).equal(7);
                parser.reset();
            }
        }
    });
    it('state SOS_PM_APC_STRING ignore rules', function () {
        parser.reset();
        var ignored = r(0x00, 0x18);
        ignored.concat(['\x19']);
        ignored.concat(r(0x1c, 0x20));
        ignored.concat(r(0x20, 0x80));
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 7;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(7);
            parser.reset();
        }
    });
    it('trans ANYWHERE/ESCAPE --> OSC_STRING', function () {
        parser.reset();
        // C0
        parser.parse('\x1b]');
        chai.expect(parser.current_state).equal(8);
        parser.reset();
        // C1
        for (var state=0; state<14; ++state) {
            parser.current_state = state;
            parser.parse('\x9d');
            chai.expect(parser.current_state).equal(8);
            parser.reset();
        }
    });
    it('state OSC_STRING ignore rules', function () {
        parser.reset();
        var ignored = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', /*'\x07',*/ '\x08',
            '\x09', '\x0a', '\x0b', '\x0c', '\x0d', '\x0e', '\x0f', '\x10', '\x11',
            '\x12', '\x13', '\x14', '\x15', '\x16', '\x17', '\x19', '\x1c', '\x1d', '\x1e', '\x1f'];
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 8;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(8);
            chai.expect(parser.osc).equal('');
            parser.reset();
        }
    });
    it('state OSC_STRING put action', function () {
        parser.reset();
        var puts = r(0x20, 0x80);
        for (var i=0; i<puts.length; ++i) {
            parser.current_state = 8;
            parser.parse(puts[i]);
            chai.expect(parser.current_state).equal(8);
            chai.expect(parser.osc).equal(puts[i]);
            parser.reset();
        }
    });
    it('state DCS_ENTRY', function () {
        parser.reset();
        // C0
        parser.parse('\x1bP');
        chai.expect(parser.current_state).equal(9);
        parser.reset();
        // C1
        for (var state=0; state<14; ++state) {
            parser.current_state = state;
            parser.parse('\x90');
            chai.expect(parser.current_state).equal(9);
            parser.reset();
        }
    });
    it('state DCS_ENTRY ignore rules', function () {
        parser.reset();
        var ignored = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
            '\x09', '\x0a', '\x0b', '\x0c', '\x0d', '\x0e', '\x0f', '\x10', '\x11',
            '\x12', '\x13', '\x14', '\x15', '\x16', '\x17', '\x19', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f'];
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 9;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(9);
            parser.reset();
        }
    });
    it('state DCS_ENTRY --> DCS_PARAM with param/collect actions', function () {
        parser.reset();
        var params = ['\x30', '\x31', '\x32', '\x33', '\x34', '\x35', '\x36', '\x37', '\x38', '\x39'];
        var collect = ['\x3c', '\x3d', '\x3e', '\x3f'];
        for (var i=0; i<params.length; ++i) {
            parser.current_state = 9;
            parser.parse(params[i]);
            chai.expect(parser.current_state).equal(10);
            chai.expect(parser.params).eql([params[i].charCodeAt(0)-48]);
            parser.reset();
        }
        parser.current_state = 9;
        parser.parse('\x3b');
        chai.expect(parser.current_state).equal(10);
        chai.expect(parser.params).eql([0,0]);
        parser.reset();
        for (i=0; i<collect.length; ++i) {
            parser.current_state = 9;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(10);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state DCS_PARAM ignore rules', function () {
        parser.reset();
        var ignored = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
            '\x09', '\x0a', '\x0b', '\x0c', '\x0d', '\x0e', '\x0f', '\x10', '\x11',
            '\x12', '\x13', '\x14', '\x15', '\x16', '\x17', '\x19', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f'];
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 10;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(10);
            parser.reset();
        }
    });
    it('state DCS_PARAM param action', function () {
        parser.reset();
        var params = ['\x30', '\x31', '\x32', '\x33', '\x34', '\x35', '\x36', '\x37', '\x38', '\x39'];
        for (var i=0; i<params.length; ++i) {
            parser.current_state = 10;
            parser.parse(params[i]);
            chai.expect(parser.current_state).equal(10);
            chai.expect(parser.params).eql([params[i].charCodeAt(0)-48]);
            parser.reset();
        }
        parser.current_state = 10;
        parser.parse('\x3b');
        chai.expect(parser.current_state).equal(10);
        chai.expect(parser.params).eql([0,0]);
        parser.reset();
    });
    it('trans DCS_ENTRY --> DCS_IGNORE', function () {
        parser.reset();
        parser.current_state = 9;
        parser.parse('\x3a');
        chai.expect(parser.current_state).equal(11);
        parser.reset();
    });
    it('trans DCS_PARAM --> DCS_IGNORE', function () {
        parser.reset();
        var chars = ['\x3a', '\x3c', '\x3d', '\x3e', '\x3f'];
        for (var i=0; i<chars.length; ++i) {
            parser.current_state = 10;
            parser.parse('\x3b' + chars[i]);
            chai.expect(parser.current_state).equal(11);
            chai.expect(parser.params).eql([0,0]);
            parser.reset();
        }
    });
    it('trans DCS_INTERMEDIATE --> DCS_IGNORE', function () {
        parser.reset();
        var chars = r(0x30, 0x40);
        for (var i=0; i<chars.length; ++i) {
            parser.current_state = 12;
            parser.parse(chars[i]);
            chai.expect(parser.current_state).equal(11);
            parser.reset();
        }
    });
    it('state DCS_IGNORE ignore rules', function () {
        parser.reset();
        var ignored = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
            '\x09', '\x0a', '\x0b', '\x0c', '\x0d', '\x0e', '\x0f', '\x10', '\x11',
            '\x12', '\x13', '\x14', '\x15', '\x16', '\x17', '\x19', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f'];
        ignored.concat(r(0x20, 0x80));
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 11;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(11);
            parser.reset();
        }
    });
    it('trans DCS_ENTRY --> DCS_INTERMEDIATE with collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 9;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(12);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('trans DCS_PARAM --> DCS_INTERMEDIATE with collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 10;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(12);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('state DCS_INTERMEDIATE ignore rules', function () {
        parser.reset();
        var ignored = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\x08',
            '\x09', '\x0a', '\x0b', '\x0c', '\x0d', '\x0e', '\x0f', '\x10', '\x11',
            '\x12', '\x13', '\x14', '\x15', '\x16', '\x17', '\x19', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f'];
        for (var i=0; i<ignored.length; ++i) {
            parser.current_state = 12;
            parser.parse(ignored[i]);
            chai.expect(parser.current_state).equal(12);
            parser.reset();
        }
    });
    it('state DCS_INTERMEDIATE collect action', function () {
        parser.reset();
        var collect = r(0x20, 0x30);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 12;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(12);
            chai.expect(parser.collected).equal(collect[i]);
            parser.reset();
        }
    });
    it('trans DCS_INTERMEDIATE --> DCS_IGNORE', function () {
        parser.reset();
        var chars = r(0x30, 0x40);
        for (var i=0; i<chars.length; ++i) {
            parser.current_state = 12;
            parser.parse('\x20' + chars[i]);
            chai.expect(parser.current_state).equal(11);
            chai.expect(parser.collected).equal('\x20');
            parser.reset();
        }
    });
    it('trans DCS_ENTRY --> DCS_PASSTHROUGH with hook', function () {
        parser.reset();
        test_terminal.clear();
        var collect = r(0x40, 0x7f);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 9;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(13);
            test_terminal.compare([['dcs hook', '', [0], collect[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans DCS_PARAM --> DCS_PASSTHROUGH with hook', function () {
        parser.reset();
        test_terminal.clear();
        var collect = r(0x40, 0x7f);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 10;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(13);
            test_terminal.compare([['dcs hook', '', [0], collect[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('trans DCS_INTERMEDIATE --> DCS_PASSTHROUGH with hook', function () {
        parser.reset();
        test_terminal.clear();
        var collect = r(0x40, 0x7f);
        for (var i=0; i<collect.length; ++i) {
            parser.current_state = 12;
            parser.parse(collect[i]);
            chai.expect(parser.current_state).equal(13);
            test_terminal.compare([['dcs hook', '', [0], collect[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state DCS_PASSTHROUGH put action', function () {
        parser.reset();
        test_terminal.clear();
        var puts = r(0x00, 0x18);
        puts.concat(['\x19']);
        puts.concat(r(0x1c, 0x20));
        puts.concat(r(0x20, 0x7f));
        for (var i=0; i<puts.length; ++i) {
            parser.current_state = 13;
            parser.parse(puts[i]);
            chai.expect(parser.current_state).equal(13);
            test_terminal.compare([['dcs put', puts[i]]]);
            parser.reset();
            test_terminal.clear();
        }
    });
    it('state DCS_PASSTHROUGH ignore', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 13;
        parser.parse('\x7f');
        chai.expect(parser.current_state).equal(13);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
});

function test(s, value, no_reset) {
    if (!no_reset) {
        parser.reset();
        test_terminal.clear();
    }
    parser.parse(s);
    test_terminal.compare(value);
}

describe('escape sequence examples', function() {
    it('CSI with print and execute', function () {
        test('\x1b[<31;5mHello World! öäü€\nabc', [
            ['csi', '<', [31, 5], 'm'],
            ['print', 'Hello World! öäü€'],
            ['exe', '\n'],
            ['print', 'abc']
        ]);
    });
    it('OSC', function () {
        test('\x1b]0;abc123€öäü\x07', [
            ['osc', '0;abc123€öäü']
        ]);
    });
    it('single DCS', function () {
        test('\x1bP1;2;3+$abc;de\x9c', [
            ['dcs hook', '+$', [1, 2, 3], 'a'],
            ['dcs put', 'bc;de'],
            ['dcs unhook']
        ]);
    });
    it('multi DCS', function () {
        test('\x1bP1;2;3+$abc;de', [
            ['dcs hook', '+$', [1, 2, 3], 'a'],
            ['dcs put', 'bc;de']
        ]);
        test_terminal.clear();
        test('abc\x9c', [
            ['dcs put', 'abc'],
            ['dcs unhook']
        ], true);
    });
    it('print + DCS(C1)', function () {
        test('abc\x901;2;3+$abc;de\x9c', [
            ['print', 'abc'],
            ['dcs hook', '+$', [1, 2, 3], 'a'],
            ['dcs put', 'bc;de'],
            ['dcs unhook']
        ]);
    });
    it('print + PM(C1) + print', function () {
        test('abc\x98123tzf\x9cdefg', [
            ['print', 'abc'],
            ['print', 'defg']
        ]);
    });
    it('print + OSC(C1) + print', function () {
        test('abc\x9d123tzf\x9cdefg', [
            ['print', 'abc'],
            ['osc', '123tzf'],
            ['print', 'defg']
        ]);
    });
    it('error recovery', function () {
        test('\x1b[1€abcdefg\x9b<;c', [
            ['print', 'abcdefg'],
            ['csi', '<', [0, 0], 'c']
        ]);
    });
});

describe('coverage tests', function() {
    it('CSI_IGNORE error', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 6;
        parser.parse('€öäü');
        chai.expect(parser.current_state).equal(6);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('DCS_IGNORE error', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 11;
        parser.parse('€öäü');
        chai.expect(parser.current_state).equal(11);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
    it('DCS_PASSTHROUGH error', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 13;
        parser.parse('€öäü');
        chai.expect(parser.current_state).equal(13);
        test_terminal.compare([['dcs put', '€öäü']]);
        parser.reset();
        test_terminal.clear();
    });
    it('error else of if (code > 159)', function () {
        parser.reset();
        test_terminal.clear();
        parser.current_state = 0;
        parser.parse('\x1e');
        chai.expect(parser.current_state).equal(0);
        test_terminal.compare([]);
        parser.reset();
        test_terminal.clear();
    });
});

var ErrorTerminal1 = function(){};
ErrorTerminal1.prototype = test_terminal;
var err_terminal1 = new ErrorTerminal1();
err_terminal1.inst_E = function(e) {
        this.calls.push(['error', e]);
    };
var err_parser1 = new AnsiParser(err_terminal1);

var ErrorTerminal2 = function(){};
ErrorTerminal2.prototype = test_terminal;
var err_terminal2 = new ErrorTerminal2();
err_terminal2.inst_E = function(e) {
        this.calls.push(['error', e]);
        return true;  // --> abort parsing
    };
var err_parser2 = new AnsiParser(err_terminal2);

describe('error tests', function() {
    it('CSI_PARAM unicode error - inst_E output w/o abort', function () {
        err_parser1.parse('\x1b[<31;5€normal print');
        err_terminal1.compare([
            ['error', {
                pos: 7,
                character: '€',
                state: 4,
                print: -1,
                dcs: -1,
                osc: '',
                collect: '<',
                params: [31,5]}],
            ['print', 'normal print']
        ]);
        parser.reset();
        test_terminal.clear();
    });
    it('CSI_PARAM unicode error - inst_E output with abort', function () {
        err_parser2.parse('\x1b[<31;5€no print');
        err_terminal2.compare([
            ['error', {
                pos: 7,
                character: '€',
                state: 4,
                print: -1,
                dcs: -1,
                osc: '',
                collect: '<',
                params: [31,5]}]
        ]);
        parser.reset();
        test_terminal.clear();
    });
});