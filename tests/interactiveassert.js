﻿(function (global) {
    
	var root = global.Ix;

	root.assertionHelper = {
		noNext: function (sequence) {
			ok(!sequence.moveNext(), 'Sequence has no next values');
		},
		hasNext: function (sequence) {
			ok(sequence.moveNext(), 'Sequence has next value');
		}
	};

})(this);