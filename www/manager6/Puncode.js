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

    // Simple textfield editing support
    function handleTextFields() {
        Ext.ComponentQuery.query('textfield').forEach(function (field) {
            if (!field._punycodeListenerAdded) {
                // Immediate check - convert existing punycode values
                var currentValue = field.getValue();
                if (typeof currentValue === 'string' && currentValue.indexOf('xn--') !== -1) {
                    try {
                        var decoded = decodeTextWithPunycode(currentValue);
                        if (decoded !== currentValue) {
                            field.originalPunycodeValue = currentValue;
                            field.setValue(decoded);
                        }
                    } catch (e) {
                    }
                }
                
                // Listen for focus event - convert punycode to Chinese when user starts editing
                field.on('focus', function() {
                    var value = field.getValue();
                    if (typeof value === 'string' && value.indexOf('xn--') !== -1) {
                        try {
                            var decoded = decodeTextWithPunycode(value);
                            if (decoded !== value) {
                                field.originalPunycodeValue = value;
                                field.setValue(decoded);
                            }
                        } catch (e) {
                        }
                    }
                });
                
                field._punycodeListenerAdded = true;
            }
        });
    }

    // Simple initialization - immediate and frequent
    handleGridColumns();
    handleTextFields();
    
    setTimeout(handleGridColumns, 100);
    setTimeout(handleTextFields, 100);
    
    setTimeout(handleGridColumns, 500);
    setTimeout(handleTextFields, 500);
    
    // Simple periodic check
    setInterval(handleGridColumns, 5000);
    setInterval(handleTextFields, 2000);

    // Simple DOM mutation handling
    try {
        var observer = new MutationObserver(function (mutations) {
            var hasNewContent = false;
            
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            hasNewContent = true;
                            
                            // Handle text content
                            if (node.textContent && node.textContent.indexOf('xn--') !== -1) {
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
                        }
                    });
                }
            });
            
            // If new content detected, immediately check for new fields
            if (hasNewContent) {
                setTimeout(function() {
                    handleGridColumns();
                    handleTextFields();
                }, 50);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } catch (e) {
    }

});