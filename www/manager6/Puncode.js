Ext.onReady(function () {
    
    // Simple punycode decoding function
    window.decodePunycode = function (value) {
        if (typeof value !== 'string' || !value || value.indexOf('xn--') === -1) {
            return value;
        }
        
        try {
            return punycode.toUnicode(value);
        } catch (e) {
            return value;
        }
    };
    
    // Simple text processing - replace punycode in text
    window.decodeTextWithPunycode = function(text) {
        if (typeof text !== 'string' || !text || text.indexOf('xn--') === -1) {
            return text;
        }
        
        try {
            return text.replace(/xn--[a-z0-9-]+/gi, function(match) {
                try {
                    var decoded = punycode.toUnicode(match);
                    return decoded !== match ? decoded : match;
                } catch (e) {
                    return match;
                }
            });
        } catch (e) {
            return text;
        }
    };


    // Simple DOM update handling
    var originalUpdate = Ext.Element.prototype.update;
    Ext.Element.prototype.update = function (html) {
        var result = originalUpdate.apply(this, arguments);
        
        try {
            var el = this.dom;
            if (el && el.innerHTML && el.innerHTML.indexOf('xn--') !== -1) {
                el.innerHTML = decodeTextWithPunycode(el.innerHTML);
            }
        } catch (e) {
        }
        
        return result;
    };

    // Simple grid column handling
    function handleGridColumns() {
        Ext.ComponentQuery.query('gridcolumn').forEach(function (column) {
            if (column.dataIndex === 'name' || column.dataIndex === 'value' || 
                column.dataIndex === 'host' || column.dataIndex === 'server' ||
                column.dataIndex === 'hostname' || column.dataIndex === 'node') {
                
                if (!column._punycodeRendererAdded) {
                    var originalRenderer = column.renderer;
                    
                    column.renderer = function (value) {
                        var result = originalRenderer ? 
                            originalRenderer.apply(this, arguments) : value;
                        
                        if (typeof result === 'string' && result.indexOf('xn--') !== -1) {
                            return decodeTextWithPunycode(result);
                        }
                        return result;
                    };
                    
                    column._punycodeRendererAdded = true;
                }
            }
        });
    }

    // Simple initialization
    setTimeout(handleGridColumns, 1000);
    
    // Simple periodic check
    setInterval(handleGridColumns, 5000);

    // Simple DOM mutation handling
    try {
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1 && node.textContent && node.textContent.indexOf('xn--') !== -1) {
                            var walker = document.createTreeWalker(
                                node, NodeFilter.SHOW_TEXT, null, false
                            );
                            
                            var textNode;
                            while (textNode = walker.nextNode()) {
                                var text = textNode.nodeValue;
                                if (text && text.indexOf('xn--') !== -1) {
                                    textNode.nodeValue = decodeTextWithPunycode(text);
                                }
                            }
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } catch (e) {
    }

});