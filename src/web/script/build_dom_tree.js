/**
 * 获取所有常规可点击元素
 *
 * @param {*} 高亮显示元素
 * @param {*} 包括属性 [attr_names...]
 * @returns { element_str, selector_map }
 */
export function get_clickable_elements(doHighlightElements = true, includeAttributes) {
  window.clickable_elements = {};
  let page_tree = build_dom_tree(doHighlightElements);
  let element_tree = parse_node(page_tree);
  let selector_map = create_selector_map(element_tree);
  let element_str = clickable_elements_to_string(element_tree, includeAttributes);
  return { element_str, selector_map };
}

export function get_highlight_element(highlightIndex) {
  return window.clickable_elements[highlightIndex];
}

export function remove_highlight() {
  let highlight = document.getElementById('playwright-highlight-container');
  if (highlight) {
    highlight.remove();
  }
}

function clickable_elements_to_string(element_tree, includeAttributes) {
  if (!includeAttributes) {
    includeAttributes = [
      'id',
      'title',
      'type',
      'name',
      'role',
      'class',
      // 'href',
      'tabindex',
      'aria-label',
      'placeholder',
      'value',
      'alt',
      'aria-expanded',
    ];
  }

  function get_all_text_till_next_clickable_element(element_node) {
    let text_parts = [];
    function collect_text(node) {
      if (node.tagName && node != element_node && node.highlightIndex != null) {
        return;
      }
      if (!node.tagName && node.text) {
        text_parts.push(node.text);
      } else if (node.tagName) {
        for (let i = 0; i < node.children.length; i++) {
          collect_text(node.children[i]);
        }
      }
    }
    collect_text(element_node);
    return text_parts.join('\n').trim().replace(/\n+/g, ' ');
  }

  function has_parent_with_highlight_index(node) {
    let current = node.parent;
    while (current) {
      if (current.highlightIndex != null) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  let formatted_text = [];
  function process_node(node, depth) {
    if (node.text == null) {
      if (node.highlightIndex != null) {
        let attributes_str = '';
        if (includeAttributes) {
          for (let i = 0; i < includeAttributes.length; i++) {
            let key = includeAttributes[i];
            let value = node.attributes[key];
            if (key && value) {
              attributes_str += ` ${key}="${value}"`;
            }
          }
          attributes_str = attributes_str.replace(/\n+/g, ' ');
        }
        let text = get_all_text_till_next_clickable_element(node);
        formatted_text.push(
          `[${node.highlightIndex}]:<${node.tagName}${attributes_str}>${text}</${node.tagName}>`
        );
      }
      for (let i = 0; i < node.children.length; i++) {
        let child = node.children[i];
        process_node(child, depth + 1);
      }
    } else if (!has_parent_with_highlight_index(node)) {
      formatted_text.push(`[]:${node.text}`);
    }
  }
  process_node(element_tree, 0);
  return formatted_text.join('\n');
}

function create_selector_map(element_tree) {
  let selector_map = {};
  function process_node(node) {
    if (node.tagName) {
      if (node.highlightIndex != null) {
        selector_map[node.highlightIndex] = node;
      }
      for (let i = 0; i < node.children.length; i++) {
        process_node(node.children[i]);
      }
    }
  }
  process_node(element_tree);
  return selector_map;
}

function parse_node(node_data, parent) {
  if (!node_data) {
    return;
  }
  if (node_data.type == 'TEXT_NODE') {
    return {
      text: node_data.text || '',
      isVisible: node_data.isVisible || false,
      parent: parent,
    };
  }
  let element_node = {
    tagName: node_data.tagName,
    xpath: node_data.xpath,
    highlightIndex: node_data.highlightIndex,
    attributes: node_data.attributes || {},
    isVisible: node_data.isVisible || false,
    isInteractive: node_data.isInteractive || false,
    isTopElement: node_data.isTopElement || false,
    shadowRoot: node_data.shadowRoot || false,
    children: [],
    parent: parent,
  };
  if (node_data.children) {
    let children = [];
    for (let i = 0; i < node_data.children.length; i++) {
      let child = node_data.children[i];
      if (child) {
        let child_node = parse_node(child, element_node);
        if (child_node) {
          children.push(child_node);
        }
      }
    }
    element_node.children = children;
  }
  return element_node;
}

function build_dom_tree(doHighlightElements) {
  let highlightIndex = 0; // 重置高亮索引

  function highlightElement(element, index, parentIframe = null) {
    // 创建或获取高亮容器
    let container = document.getElementById('playwright-highlight-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'playwright-highlight-container';
      container.style.position = 'fixed';
      container.style.pointerEvents = 'none';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.zIndex = '2147483647'; // 最大 z 索引值
      document.documentElement.appendChild(container);
    }

    // 根据索引生成颜色
    const colors = [
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#FFA500',
      '#800080',
      '#008080',
      '#FF69B4',
      '#4B0082',
      '#FF4500',
      '#2E8B57',
      '#DC143C',
      '#4682B4',
    ];
    const colorIndex = index % colors.length;
    const baseColor = colors[colorIndex];
    const backgroundColor = `${baseColor}1A`; // 不透明度为 10% 的颜色

    // 创建高亮叠加
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.border = `2px solid ${baseColor}`;
    overlay.style.pointerEvents = 'none';
    overlay.style.boxSizing = 'border-box';

    // 根据元素定位叠加
    const rect = element.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;

    if (rect.width < window.innerWidth / 2 || rect.height < window.innerHeight / 2) {
      overlay.style.backgroundColor = backgroundColor;
    }

    // 如果元素位于 iframe 内，则调整位置
    if (parentIframe) {
      const iframeRect = parentIframe.getBoundingClientRect();
      top += iframeRect.top;
      left += iframeRect.left;
    }

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // 创建标签
    const label = document.createElement('div');
    label.className = 'playwright-highlight-label';
    label.style.position = 'absolute';
    label.style.background = baseColor;
    label.style.color = 'white';
    label.style.padding = '1px 4px';
    label.style.borderRadius = '4px';
    label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`; // 响应式字体大小
    label.textContent = index;

    // 计算标签位置
    const labelWidth = 20; // 大致宽度
    const labelHeight = 16; // 大致高度
    // 默认位置（框内右上角）
    let labelTop = top + 2;
    let labelLeft = left + rect.width - labelWidth - 2;

    // 如果方框太小，则进行调整
    if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
      // 如果方框太小，则在方框外定位
      labelTop = top - labelHeight - 2;
      labelLeft = left + rect.width - labelWidth;
    }

    // 确保标签保持在视窗内
    if (labelTop < 0) labelTop = top + 2;
    if (labelLeft < 0) labelLeft = left + 2;
    if (labelLeft + labelWidth > window.innerWidth) {
      labelLeft = left + rect.width - labelWidth - 2;
    }

    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;

    // 添加到容器中
    container.appendChild(overlay);
    container.appendChild(label);

    // 存储参考信息以便清理
    element.setAttribute('browser-user-highlight-id', `playwright-highlight-${index}`);

    return index + 1;
  }

  // 辅助函数，以树形式生成 XPath
  function getXPathTree(element, stopAtBoundary = true) {
    const segments = [];
    let currentElement = element;

    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
      // 如果遇到阴影根节点或 iframe，则停止运行
      if (
        stopAtBoundary &&
        (currentElement.parentNode instanceof ShadowRoot ||
          currentElement.parentNode instanceof HTMLIFrameElement)
      ) {
        break;
      }

      let index = 0;
      let sibling = currentElement.previousSibling;
      while (sibling) {
        if (
          sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === currentElement.nodeName
        ) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = currentElement.nodeName.toLowerCase();
      const xpathIndex = index > 0 ? `[${index + 1}]` : '';
      segments.unshift(`${tagName}${xpathIndex}`);

      currentElement = currentElement.parentNode;
    }

    return segments.join('/');
  }

  // 辅助函数，用于检查元素是否被接受
  function isElementAccepted(element) {
    const leafElementDenyList = new Set(['svg', 'script', 'style', 'link', 'meta']);
    return !leafElementDenyList.has(element.tagName.toLowerCase());
  }

  // 辅助函数，用于检查元素是否交互
  function isInteractiveElement(element) {
    // 基础互动元素和作用
    const interactiveElements = new Set([
      'a',
      'button',
      'details',
      'embed',
      'input',
      'label',
      'menu',
      'menuitem',
      'object',
      'select',
      'textarea',
      'summary',
    ]);

    const interactiveRoles = new Set([
      'button',
      'menu',
      'menuitem',
      'link',
      'checkbox',
      'radio',
      'slider',
      'tab',
      'tabpanel',
      'textbox',
      'combobox',
      'grid',
      'listbox',
      'option',
      'progressbar',
      'scrollbar',
      'searchbox',
      'switch',
      'tree',
      'treeitem',
      'spinbutton',
      'tooltip',
      'a-button-inner',
      'a-dropdown-button',
      'click',
      'menuitemcheckbox',
      'menuitemradio',
      'a-button-text',
      'button-text',
      'button-icon',
      'button-icon-only',
      'button-text-icon-only',
      'dropdown',
      'combobox',
    ]);

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const ariaRole = element.getAttribute('aria-role');
    const tabIndex = element.getAttribute('tabindex');

    // 基础角色/属性检查
    const hasInteractiveRole =
      interactiveElements.has(tagName) ||
      interactiveRoles.has(role) ||
      interactiveRoles.has(ariaRole) ||
      (tabIndex !== null && tabIndex !== '-1') ||
      element.getAttribute('data-action') === 'a-dropdown-select' ||
      element.getAttribute('data-action') === 'a-dropdown-button';

    if (hasInteractiveRole) return true;

    // 获取计算样式
    const style = window.getComputedStyle(element);

    // 检查元素是否具有类似点击的样式
    // const hasClickStyling = style.cursor === 'pointer' ||
    //     element.style.cursor === 'pointer' ||
    //     style.pointerEvents !== 'none';

    // 检查事件监听器
    const hasClickHandler =
      element.onclick !== null ||
      element.getAttribute('onclick') !== null ||
      element.hasAttribute('ng-click') ||
      element.hasAttribute('@click') ||
      element.hasAttribute('v-on:click');

    // 辅助函数，用于安全地获取事件侦听器
    function getEventListeners(el) {
      try {
        // 尝试使用 Chrome DevTools API 获取侦听器
        return window.getEventListeners?.(el) || {};
      } catch (e) {
        // Fallback: 检查常见事件属性
        const listeners = {};

        // 需要检查的常见事件类型列表
        const eventTypes = [
          'click',
          'mousedown',
          'mouseup',
          'touchstart',
          'touchend',
          'keydown',
          'keyup',
          'focus',
          'blur',
        ];

        for (const type of eventTypes) {
          const handler = el[`on${type}`];
          if (handler) {
            listeners[type] = [
              {
                listener: handler,
                useCapture: false,
              },
            ];
          }
        }

        return listeners;
      }
    }

    // 检查元素本身是否存在与点击相关的事件
    const listeners = getEventListeners(element);
    const hasClickListeners =
      listeners &&
      (listeners.click?.length > 0 ||
        listeners.mousedown?.length > 0 ||
        listeners.mouseup?.length > 0 ||
        listeners.touchstart?.length > 0 ||
        listeners.touchend?.length > 0);

    // 检查表明具有交互性的 ARIA 属性
    const hasAriaProps =
      element.hasAttribute('aria-expanded') ||
      element.hasAttribute('aria-pressed') ||
      element.hasAttribute('aria-selected') ||
      element.hasAttribute('aria-checked');

    // 检查表单相关功能
    const isFormRelated =
      element.form !== undefined ||
      element.hasAttribute('contenteditable') ||
      style.userSelect !== 'none';

    // 检查元素是否可拖曳
    const isDraggable = element.draggable || element.getAttribute('draggable') === 'true';

    return (
      hasAriaProps ||
      // hasClickStyling ||
      hasClickHandler ||
      hasClickListeners ||
      // isFormRelated ||
      isDraggable
    );
  }

  // 辅助函数，用于检查元素是否可见
  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      element.offsetWidth > 0 &&
      element.offsetHeight > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  }

  // 辅助函数，用于检查元素是否是其所在位置的顶层元素
  function isTopElement(element) {
    // 查找正确的文档上下文和根元素
    let doc = element.ownerDocument;

    // 如果在 iframe 中，默认情况下元素会被置于顶部
    if (doc !== window.document) {
      return true;
    }

    // 对于 Shadow DOM，需要在其根上下文中进行检查
    const shadowRoot = element.getRootNode();
    if (shadowRoot instanceof ShadowRoot) {
      const rect = element.getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

      try {
        // 使用 Shadow 根的 elementFromPoint 在 Shadow DOM 上下文中进行检查
        const topEl = shadowRoot.elementFromPoint(point.x, point.y);
        if (!topEl) return false;

        // 检查元素或其任何父级元素是否与目标元素匹配
        let current = topEl;
        while (current && current !== shadowRoot) {
          if (current === element) return true;
          current = current.parentElement;
        }
        return false;
      } catch (e) {
        return true; // 如果无法确定，就认为它是可见的
      }
    }

    // 常规 DOM 元素
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    try {
      const topEl = document.elementFromPoint(point.x, point.y);
      if (!topEl) return false;

      let current = topEl;
      while (current && current !== document.documentElement) {
        if (current === element) return true;
        current = current.parentElement;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  // 辅助函数，用于检查文本节点是否可见
  function isTextNodeVisible(textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();

    return (
      rect.width !== 0 &&
      rect.height !== 0 &&
      rect.top >= 0 &&
      rect.top <= window.innerHeight &&
      textNode.parentElement?.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    );
  }

  // 遍历 DOM 并创建嵌套 JSON 的函数
  function buildDomTree(node, parentIframe = null) {
    if (!node) return null;

    // 文本节点特例
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent.trim();
      if (textContent && isTextNodeVisible(node)) {
        return {
          type: 'TEXT_NODE',
          text: textContent,
          isVisible: true,
        };
      }
      return null;
    }

    // 检查元素是否已被接受
    if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
      return null;
    }

    const nodeData = {
      tagName: node.tagName ? node.tagName.toLowerCase() : null,
      attributes: {},
      xpath: node.nodeType === Node.ELEMENT_NODE ? getXPathTree(node, true) : null,
      children: [],
    };

    // 如果节点是元素，则复制所有属性
    if (node.nodeType === Node.ELEMENT_NODE && node.attributes) {
      // 使用 getAttributeNames() 代替直接迭代属性
      const attributeNames = node.getAttributeNames?.() || [];
      for (const name of attributeNames) {
        nodeData.attributes[name] = node.getAttribute(name);
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const isInteractive = isInteractiveElement(node);
      const isVisible = isElementVisible(node);
      const isTop = isTopElement(node);

      nodeData.isInteractive = isInteractive;
      nodeData.isVisible = isVisible;
      nodeData.isTopElement = isTop;

      // 如果元素符合所有标准并启用高亮显示，则高亮显示
      if (isInteractive && isVisible && isTop) {
        nodeData.highlightIndex = highlightIndex++;
        window.clickable_elements[nodeData.highlightIndex] = node;
        if (doHighlightElements) {
          highlightElement(node, nodeData.highlightIndex, parentIframe);
        }
      }
    }

    // 只有在 iframe 内才添加 iframeContext
    // if (parentIframe) {
    //     nodeData.iframeContext = `iframe[src="${parentIframe.src || ''}"]`;
    // }

    // 仅在 Shadow 根字段存在时添加该字段
    if (node.shadowRoot) {
      nodeData.shadowRoot = true;
    }

    // 处理 shadow DOM
    if (node.shadowRoot) {
      const shadowChildren = Array.from(node.shadowRoot.childNodes).map((child) =>
        buildDomTree(child, parentIframe)
      );
      nodeData.children.push(...shadowChildren);
    }

    // 处理 iframes
    if (node.tagName === 'IFRAME') {
      try {
        const iframeDoc = node.contentDocument || node.contentWindow.document;
        if (iframeDoc) {
          const iframeChildren = Array.from(iframeDoc.body.childNodes).map((child) =>
            buildDomTree(child, node)
          );
          nodeData.children.push(...iframeChildren);
        }
      } catch (e) {
        console.warn('无法访问 iframe：', node);
      }
    } else {
      const children = Array.from(node.childNodes).map((child) =>
        buildDomTree(child, parentIframe)
      );
      nodeData.children.push(...children);
    }

    return nodeData;
  }
  return buildDomTree(document.body);
}

window.get_clickable_elements = get_clickable_elements;
window.get_highlight_element = get_highlight_element;
window.remove_highlight = remove_highlight;
