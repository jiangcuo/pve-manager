Ext.onReady(function () {
    //   console.log('应用安全的解决方案...');

    // 创建一个全局的punycode处理函数
    window.decodePunycode = function (value) {
        if (typeof value === 'string' && value.startsWith('xn--')) {
            try {
                return punycode.toUnicode(value);
            } catch (e) {
                console.error('Punycode解码错误:', e);
                return value;
            }
        }
        return value;
    };

    // 更安全的方法：只修改渲染过程，不修改模板

    // 1. 处理所有渲染后的HTML内容
    var originalUpdate = Ext.Element.prototype.update;
    Ext.Element.prototype.update = function (html) {
        // 先将内容渲染到元素
        var result = originalUpdate.apply(this, arguments);

        // 然后查找并替换所有punycode文本
        try {
            var el = this.dom;
            if (el && el.innerHTML && el.innerHTML.indexOf('xn--') !== -1) {
                // 对已渲染的内容进行处理
                el.innerHTML = el.innerHTML.replace(/xn--[a-z0-9-]+/g, function (match) {
                    //     console.log('在渲染后HTML中找到Punycode:', match);
                    return decodePunycode(match);
                });
            }
        } catch (e) {
            // console.error('HTML处理错误:', e);
        }

        return result;
    };

    // 2. 修改文本节点的设置方法
    var originalCreateDom = Ext.dom.Helper.createDom;
    Ext.dom.Helper.createDom = function (o, parentNode) {
        // 在创建DOM之前处理文本内容
        if (o && typeof o === 'object') {
            if (o.tag && o.html && typeof o.html === 'string' && o.html.indexOf('xn--') !== -1) {
                o.html = o.html.replace(/xn--[a-z0-9-]+/g, function (match) {
                    //    console.log('在DOM创建中找到Punycode:', match);
                    return decodePunycode(match);
                });
            }
            else if (o.tag && o.children) {
                for (var i = 0; i < o.children.length; i++) {
                    var child = o.children[i];
                    if (child && child.html && typeof child.html === 'string' && child.html.indexOf('xn--') !== -1) {
                        child.html = child.html.replace(/xn--[a-z0-9-]+/g, function (match) {
                            return decodePunycode(match);
                        });
                    }
                }
            }
        }

        return originalCreateDom.apply(this, arguments);
    };

    // 3. 处理特定字段和列
    function handleFieldAndColumnComponents() {
        // 处理所有文本字段
        Ext.ComponentQuery.query('textfield').forEach(function (field) {
            var value = field.getValue();
            if (typeof value === 'string' && value.startsWith('xn--')) {
                //  console.log('处理文本字段:', value);
                // 仅设置显示值，不改变实际值
                field.setRawValue(decodePunycode(value));
            }
        });

        // 处理所有列
        Ext.ComponentQuery.query('gridcolumn').forEach(function (column) {
            // 只修改特定的列
            if (column.dataIndex === 'name' || column.dataIndex === 'value') {
                var originalRenderer = column.renderer;

                // 设置新的渲染器
                column.renderer = function (value) {
                    // 先应用原始渲染器
                    var result = originalRenderer ?
                        originalRenderer.apply(this, arguments) : value;

                    // 解码显示
                    if (typeof result === 'string' && result.startsWith('xn--')) {
                        //   console.log('列渲染器处理:', result);
                        return decodePunycode(result);
                    }
                    return result;
                };
            }
        });
    }

    // 稍后执行处理，确保组件已初始化
    setTimeout(handleFieldAndColumnComponents, 1000);

    // 4. 创建MutationObserver来处理动态添加的内容
    try {
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) { // 元素节点
                            var content = node.textContent || node.innerText;
                            if (content && content.indexOf('xn--') !== -1) {
                                // 遍历所有文本节点
                                var walker = document.createTreeWalker(
                                    node, NodeFilter.SHOW_TEXT, null, false
                                );

                                var textNode;
                                while (textNode = walker.nextNode()) {
                                    var text = textNode.nodeValue;
                                    if (text && text.indexOf('xn--') !== -1) {
                                        textNode.nodeValue = text.replace(/xn--[a-z0-9-]+/g, function (match) {
                                            return decodePunycode(match);
                                        });
                                    }
                                }
                            }
                        }
                    });
                }
            });
        });

        // 监视整个文档
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        //  console.log('DOM监视器已启动');
    } catch (e) {
        //console.error('创建MutationObserver失败:', e);
    }

    //console.log('安全解决方案已应用');
});