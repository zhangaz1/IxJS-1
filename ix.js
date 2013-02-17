// Copyright (c) Microsoft Open Technologies, Inc. All rights reserved. See License.txt in the project root for license information.

(function (root, factory) {
    var freeExports = typeof exports == 'object' && exports &&
    (typeof root == 'object' && root && root == root.global && (window = root), exports);

    // Because of build optimizers
    if (typeof define === 'function' && define.amd) {
        define(['Ix', 'exports'], function (Ix, exports) {
            root.Ix = factory(root, exports, Ix);
            return root.Ix;
        });
    } else if (typeof module == 'object' && module && module.exports == freeExports) {
        module.exports = factory(root, module.exports, require('./l2o'));
    } else {
        root.Ix = factory(root, {}, root.Ix);
    }
}(this, function (global, exp, root, undefined) {
    
    function noop () { }
    function identity (x) { return x; }
    function defaultComparer (x, y) { return x > y ? 1 : x < y ? -1 : 0; }
    function defaultEqualityComparer (x, y) { return x === y; }

    function arrayIndexOf(key, comparer) {
        comparer || (comparer = defaultEqualityComparer);
        for (var i = 0, len = this.length; i < len; i++) {
            if (comparer(key, this[i])) {
                return i;
            }
        }
        return -1;
    }

    var seqNoElements = 'Sequence contains no elements.';
    var slice = Array.prototype.slice;

    var Enumerable = root.Enumerable,
        EnumerablePrototype = Enumerable.prototype,
        enumerableConcat = Enumerable.concat,
        enumerableEmpty = Enumerable.empty,
        enumerableFromArray = Enumerable.fromArray,
        enumerableRepeat = Enumerable.repeat,
        enumeratorCreate = root.Enumerator.create
        inherits = root.internals.inherits;

    /** 
     * Determines whether an enumerable sequence is empty.
     * @return {Boolean} true if the sequence is empty; false otherwise.
     */
    EnumerablePrototype.isEmpty = function () {
        return !this.any();
    };

    /**
     *  Returns the minimum value in the enumerable sequence by using the specified comparer to compare values.
     *  @param {Function} comparer Comparer used to determine the minimum value.
     *  @return {Any} Minimum value in the sequence.
     */
    EnumerablePrototype.min = function (comparer) {
        return this.minBy(identity, comparer).first();
    };

    function extremaBy (source, keySelector, comparer) {
        var result = [], e = source.getEnumerator();
        try {
            if (!e.moveNext()) { throw new Error(seqNoElements); }

            var current = e.getCurrent(),
                resKey = keySelector(current);
            result.push(current);

            while (e.moveNext()) {
                var cur = e.getCurrent(),
                    key = keySelector(cur),
                    cmp = comparer(key, resKey);
                if (cmp === 0) {
                    result.push(cur);
                } else if (cmp > 0) {
                    result = [cur];
                    resKey = key;
                }
            }
        } finally {
            e.dispose();
        }

        return enumerableFromArray(result);
    }

    /**
     * Returns the elements with the minimum key value by using the specified comparer to compare key values.
     * @param keySelector Key selector used to extract the key for each element in the sequence.
     * @param comparer Comparer used to determine the minimum key value.
     * @return List with the elements that share the same minimum key value.
     */
    EnumerablePrototype.minBy = function (keySelector, comparer) {
        comparer || (comparer = defaultComparer);
        return extremaBy(this, keySelector, function (key, minValue) {
            return -comparer(key, minValue);
        });
    };

    /**
     * Returns the maximum value in the enumerable sequence by using the specified comparer to compare values.
     * @param comparer Comparer used to determine the maximum value.
     * @return Maximum value in the sequence.
     */
    EnumerablePrototype.max = function(selector) {
        if(selector) {
            return this.select(selector).max();
        }       
        var m, hasElement = false, e = this.getEnumerator();
        try {
            while (e.moveNext()) {
                var x = e.getCurrent();
                if (!hasElement) {
                    m = x;
                    hasElement = true;
                } else {
                    if (x > m) {
                        m = x;
                    }
                }
            }
        } finally {
            e.dispose();
        }
        if(!hasElement) { throw new Error(seqNoElements); }
        return m;
    };

    /**
     * Returns the elements with the minimum key value by using the specified comparer to compare key values.
     * @param keySelector Key selector used to extract the key for each element in the sequence.
     * @param comparer Comparer used to determine the maximum key value.
     * @return List with the elements that share the same maximum key value.
     */
    EnumerablePrototype.maxBy = function (keySelector, comparer) {
        comparer || (comparer = defaultComparer);
        return extremaBy(this, keySelector, comparer);  
    };

    /**
     * Returns a sequence with a single element.
     * 
     * @param value Single element of the resulting sequence.
     * @return Sequence with a single element.
     */
    Enumerable.returnValue = function (value) {
        return new Enumerable(function () {
            var done = false;
            return enumeratorCreate(
                function () {
                    if (done) {
                        return false;
                    }
                    return done = true;
                },
                function () {
                    return value;
                }
            );
        });
    };

    /**
     * Returns a sequence that throws an exception upon enumeration.
     * 
     * @param exception Exception to throw upon enumerating the resulting sequence.
     * @return Sequence that throws the specified exception upon enumeration.
     */
    Enumerable.throwException = function (value) {
        return new Enumerable(function () {
            return enumeratorCreate(
                function () { throw value; },
                noop);
        });
    };

    /**
     * Creates an enumerable sequence based on an enumerable factory function.
     * 
     * @param enumerableFactory Enumerable factory function.
     * @return Sequence that will invoke the enumerable factory upon a call to GetEnumerator.
     */
    var enumerableDefer = Enumerable.defer = function (enumerableFactory) {
        return new Enumerable(function () {
            var enumerator;
            return enumeratorCreate(function () {
                enumerator || (enumerator = enumerableFactory().getEnumerator());
                return enumerator.moveNext();
            }, function () {
                return enumerator.getCurrent();
            }, function () {
                enumerator.dispose();
            });
        });
    };

    /**
     * Generates a sequence by mimicking a for loop.
     * 
     * @param initialState Initial state of the generator loop.
     * @param condition Loop condition.
     * @param iterate State update function to run after every iteration of the generator loop.
     * @param resultSelector Result selector to compute resulting sequence elements.
     * @return Sequence obtained by running the generator loop, yielding computed elements.
     */
    Enumerable.generate = function (initialState, condition, iterate, resultSelector) {
        return new Enumerable(function () {
            var state, current, initialized = false;
            return enumeratorCreate(function () {
                if (!initialized) {
                    state = initialState;
                    initialized = true;
                } else {
                    state = iterate(state);
                    if (!condition(state)) {
                        return false;
                    }
                }
                current = resultSelector(state);
                return true;
            }, function () { return current; });
        });
    };

    /**
     * Generates a sequence that's dependent on a resource object whose lifetime is determined by the sequence usage duration.
     * 
     * @param resourceFactory Resource factory function.
     * @param enumerableFactory Enumerable factory function, having access to the obtained resource.
     * @return Sequence whose use controls the lifetime of the associated obtained resource.
     */
    Enumerable.using = function (resourceFactory, enumerableFactory) {
        return new Enumerable(function () {
            var current, first = true, e, res;
            return enumeratorCreate(function () {
                if (first) {
                    res = resourceFactory();
                    e = enumerableFactory(res).getEnumerator();
                    first = false;
                }
                if (!e.moveNext()) {
                    return false;
                }

                current = e.getCurrent();
                return true;
            }, function () {
                return current;
            }, function () {
                e && e.dispose();
                res && res.dispose();
            });
        });
    };

    function functionBind(f, context) {
        return function () {
            f.apply(context, arguments);
        };
    }

    /**
     * Lazily invokes an action for each value in the sequence, and executes an action upon successful or exceptional termination.
     * 
     * e.doAction(onNext);
     * e.doAction(onNext, onError);
     * e.doAction(onNExt, onError, onCompleted);
     * e.doAction(observer);

     * @param onNext Action to invoke for each element or Observer.
     * @param onError Action to invoke on exceptional termination of the sequence.
     * @param onCompleted Action to invoke on successful termination of the sequence.
     * @return Sequence exhibiting the specified side-effects upon enumeration.
     */
    EnumerablePrototype.doAction = function (onNext, onError, onCompleted) {
        var oN, oE, oC, self = this;
        if (typeof onNext === 'object') {
            oN = functionBind(onNext.onNext, onNext);
            oE = functionBind(onNext.onError, onNext);
            oC = functionBind(onNext.onCompleted, onNext);
        } else {
            oN = onNext; 
            oE = onError || noop;
            oC = onCompleted || noop;
        }
        return new Enumerable(function () {
            var e, done, current;
            return enumeratorCreate(
                function () {
                    e || (e = self.getEnumerator());
                    try {
                        if (!e.moveNext()) {
                            oC();
                            return false; 
                        }
                        current = e.getCurrent();
                    } catch (e) {
                        oE(e);
                        throw e;
                    }
                    oN(current);
                    return true;
                },
                function () { return current; }, 
                function () { e && e.dispose(); }
            );
        });
    };
    
    /**
     * Generates a sequence of buffers over the source sequence, with specified length and possible overlap.
     * @param count Number of elements for allocated buffers.
     * @param skip Number of elements to skip between the start of consecutive buffers.
     * @return Sequence of buffers containing source sequence elements.
     */
    EnumerablePrototype.bufferWithCount = function (count, skip) {
        var parent = this;
        if (skip == null) { skip = count; }
        return new Enumerable(function () {
            var buffers = [], i = 0, e, current;
            return enumeratorCreate(
                function () {
                    e || (e = parent.getEnumerator());
                    while (true) {
                        if (e.moveNext()) {
                            if (i % skip === 0) {
                                buffers.push([]);
                            }

                            for (var idx = 0, len = buffers.length; idx < len; idx++) {
                                buffers[idx].push(e.getCurrent());
                            }

                            if (buffers.length > 0 && buffers[0].length === count) {
                                current = Enumerable.fromArray(buffers.shift());
                                ++i;
                                return true;
                            }

                            ++i;
                        } else {
                             if (buffers.length > 0) {
                                current = Enumerable.fromArray(buffers.shift());
                                return true;
                            }
                            return false; 
                        }
                    }
                },
                function () { return current; },
                function () { e.dispose(); });
        });
    };

    /**
     * Ignores all elements in the source sequence.
     * @return Source sequence without its elements.
     */
    EnumerablePrototype.ignoreElements = function() {
        var parent = this;
        return new Enumerable(function () {
            var e;
            return enumeratorCreate(
                function () {
                    e = parent.getEnumerator();
                    while (e.moveNext()) { }
                    return false;
                },
                function () {
                    throw new Error('Operation is not valid due to the current state of the object.');
                },
                function () { e.dispose(); }
            );
        });
    };

    /**
     * Returns elements with a distinct key value by using the specified equality comparer to compare key values.
     * @param keySelector Key selector.
     * @param comparer Comparer used to compare key values.
     * @return Sequence that contains the elements from the source sequence with distinct key values.
     */
    EnumerablePrototype.distinctBy = function(keySelector, comparer) {
        comparer || (comparer = defaultEqualityComparer);
        var parent = this;
        return new Enumerable(function () {
            var current, map = [], e;
            return enumeratorCreate(
                function () {
                    e || (e = parent.getEnumerator());
                    while (true) {
                        if (!e.moveNext()) { return false; }
                        var item = e.getCurrent(), key = keySelector(item);
                        if (arrayIndexOf.call(map, key, comparer) === -1) {
                            map.push(item);
                            current = item;
                            return true;
                        }
                    }
                },
                function () { return current; },
                function () { e && e.dispose(); }
            );
        });
    };

    /**
     * Returns consecutive distinct elements based on a key value by using the specified equality comparer to compare key values.
     * @param keySelector Key selector.
     * @param comparer Comparer used to compare key values.
     * @return Sequence without adjacent non-distinct elements.
     */
    EnumerablePrototype.distinctUntilChanged = function (keySelector, comparer) {
        keySelector || (keySelector = identity);
        comparer || (comparer = defaultEqualityComparer);
        var parent = this;
        return new Enumerable(function () {
            var current, e, currentKey, hasCurrentKey;
            return enumeratorCreate(
                function () {
                    e || (e = parent.getEnumerator());
                    while (true) {
                        if (!e.moveNext()) {
                            return false;
                        }
                        var item = e.getCurrent(),
                            key = keySelector(item),
                            comparerEquals = false;
                        if (hasCurrentKey) {
                            comparerEquals = comparer(currentKey, key);
                        }
                        if (!hasCurrentKey || !comparerEquals) {
                            current = item;
                            currentKey = key;
                            hasCurrentKey = true;
                            return true;
                        }
                    }
                },
                function () { return current; },
                function () { e && e.dispose(); });
        });
    };

    /**
     * Expands the sequence by recursively applying a selector function.
     * @param selector Selector function to retrieve the next sequence to expand.
     * @return Sequence with results from the recursive expansion of the source sequence.
     */
    EnumerablePrototype.expand = function(selector) {
        var parent = this;
        return new Enumerable(function () {
            var current, q = [parent], inner;
            return enumeratorCreate(
                function () {
                    while (true) {
                        if (!inner) {
                            if (q.length === 0) { return false; }
                            inner = q.shift().getEnumerator();
                        }
                        if (inner.moveNext()) {
                            current = inner.getCurrent();
                            q.push(selector(current));
                            return true;
                        } else {
                            inner.dispose();
                            inner = null;
                        }
                    }
                },
                function () { return current; },
                function () { inner && inner.dispose(); }
            );
        });
    };

    /**
     * Returns the source sequence prefixed with the specified value.
     * @param values Values to prefix the sequence with.
     * @return Sequence starting with the specified prefix value, followed by the source sequence.
     */
    EnumerablePrototype.startWith = function () {
        return enumerableConcat(enumerableFromArray(slice.call(arguments)), this);
    };

    function scan (seed, accumulator) {
        var source = this;
        return new Enumerable(function () {
            var current, e, acc = seed;
            return enumeratorCreate(
                function () {
                    e || (e = source.getEnumerator());
                    if (!e.moveNext()) { return false; }
                    var item = e.getCurrent();
                    acc = accumulator(acc, item);
                    current = acc;
                    return true;
                },
                function () { return current; },
                function () { e && e.dispose(); }
            );
        });
    }

    function scan1 (accumulator) {
        var source = this;
        return new Enumerable(function () {
            var current, e, acc, hasSeed = false;
            return enumeratorCreate(
                function () {
                    e || (e = source.getEnumerator());
                    
                    while(true) {
                        if (!e.moveNext()) { return false; }
                        var item = e.getCurrent();

                        if (!hasSeed) {
                            hasSeed = true;
                            acc = item;
                            continue;
                        }

                        acc = accumulator(acc, item);
                        current = acc;
                        return true;
                    }

                },
                function () { return current; },
                function () { e && e.dispose(); }
            );
        });
    } 

    /**
     * Generates a sequence of accumulated values by scanning the source sequence and applying an accumulator function.
     * @param seed Accumulator seed value.
     * @param accumulator Accumulation function to apply to the current accumulation value and each element of the sequence.
     * @return Sequence with all intermediate accumulation values resulting from scanning the sequence.
     */
    EnumerablePrototype.scan = function (/* seed, accumulator */) {
        var f = arguments.length === 1 ? scan1 : scan;
        return f.apply(this, arguments);
    };

    /**
     * Returns a specified number of contiguous elements from the end of the sequence.
     * @param count The number of elements to take from the end of the sequence.
     * @return Sequence with the specified number of elements counting from the end of the source sequence.
     */
    EnumerablePrototype.takeLast = function (count) {
        var parent = this;
        return new Enumerable(function () {
            var current, e, q;
            return enumeratorCreate(
                function () {
                    e || (e = parent.getEnumerator());
                    if (!q) {
                        q = [];
                        while (e.moveNext()) {
                            q.push(e.getCurrent());
                            if (q.length > count) {
                                q.shift();
                            }
                        }
                    }
                    if (q.length === 0) {
                        return false;
                    }
                    current = q.shift();
                    return true;
                },
                function () { return current; },
                function () { e && e.dispose(); }
            );
        });
    };

    /**
     * Bypasses a specified number of contiguous elements from the end of the sequence and returns the remaining elements.
     * @param count The number of elements to skip from the end of the sequence before returning the remaining elements.
     * @return Sequence bypassing the specified number of elements counting from the end of the source sequence.
     */
    EnumerablePrototype.skipLast = function (count) {
        var parent = this;
        return new Enumerable(function () {
            var current, e, q = [];
            return enumeratorCreate(
                function () {
                    e || (e = parent.getEnumerator());
                    while (true) {
                        if (!e.moveNext()) {
                            return false;
                        }
                        q.push(e.getCurrent());
                        if (q.length > count) {
                            current = q.shift();
                            return true;
                        }
                    }
                },
                function () { return current; },
                function () { e && e.dispose(); }
            );
        });
    };

    /**
     * Repeats and concatenates the source sequence the given number of times.
     * @param count Number of times to repeat the source sequence.
     * @return Sequence obtained by concatenating the source sequence to itself the specified number of times.
     */
    EnumerablePrototype.repeat = function (count) {
        var parent = this;
        return enumerableRepeat(0, count).selectMany(function () { return parent; });
    };     

    return root;
}));