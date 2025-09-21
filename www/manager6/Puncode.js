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
    
    // Simple Chinese to punycode encoding function
    window.encodeToPunycode = function(value) {
        if (typeof value !== 'string' || !value) {
            return value;
        }
        
        // Check if contains non-ASCII characters (Chinese)
        if (!/[^\x00-\x7F]/.test(value)) {
            return value; // Only ASCII, no need to encode
        }
        
        try {
            return punycode.toASCII(value);
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
        // Query multiple types of input fields
        var selectors = ['textfield', 'textareafield', 'displayfield', 'field'];
        
        selectors.forEach(function(selector) {
            Ext.ComponentQuery.query(selector).forEach(function (field) {
            if (!field._punycodeListenerAdded) {
                // Immediate conversion - show Chinese when textfield is displayed
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
                
                // Listen for focus event - ensure Chinese is displayed when editing
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
                
                // Listen for blur event - convert Chinese back to punycode for backend
                field.on('blur', function() {
                    var currentValue = field.getValue();
                    
                    if (typeof currentValue === 'string' && currentValue) {
                        // If contains Chinese characters, encode to punycode
                        if (/[^\x00-\x7F]/.test(currentValue)) {
                            try {
                                var encoded = encodeToPunycode(currentValue);
                                if (encoded !== currentValue) {
                                    field.setValue(encoded);
                                }
                            } catch (e) {
                            }
                        } else if (field.originalPunycodeValue) {
                            // If original was punycode and current is ASCII, use original
                            field.setValue(field.originalPunycodeValue);
                        }
                    }
                    
                    // Clean up
                    delete field.originalPunycodeValue;
                });
                
                field._punycodeListenerAdded = true;
            }
            });
        });
    }

    // Aggressive initialization - ensure immediate conversion
    handleGridColumns();
    handleTextFields();
    
    // Multiple quick checks to catch textfields as soon as they appear
    setTimeout(handleTextFields, 10);
    setTimeout(handleTextFields, 50);
    setTimeout(handleTextFields, 100);
    setTimeout(handleTextFields, 200);
    setTimeout(handleTextFields, 500);
    setTimeout(handleTextFields, 1000);
    
    setTimeout(handleGridColumns, 100);
    setTimeout(handleGridColumns, 500);
    
    // Frequent periodic check for textfields
    setInterval(handleTextFields, 500);
    setInterval(handleGridColumns, 5000);

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
                // Immediate check
                handleTextFields();
                
                // Quick follow-ups to catch delayed rendering
                setTimeout(handleTextFields, 10);
                setTimeout(handleTextFields, 50);
                setTimeout(handleTextFields, 100);
                
                setTimeout(handleGridColumns, 50);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } catch (e) {
    }

});