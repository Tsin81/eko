/**
 * Common JS 函数
 */
if (!window.eko) {
    window.eko = {}
}

/**
 * 提取 HTML 内容
 */
eko.extractHtmlContent = function (element) {
    element = element || document.body
    let main = element.querySelector('main')
    let content = ''
    if (main) {
        let articles = main.querySelectorAll('article')
        if (articles && articles.length > 0) {
            for (let i = 0; i < articles.length; i++) {
                content += articles[i].innerText.trim() + '\n'
            }
        } else {
            content += main.innerText.trim()
        }
    } else {
        let articles = element.querySelectorAll('article')
        if (articles && articles.length > 0) {
            for (let i = 0; i < articles.length; i++) {
                content += articles[i].innerText.trim() + '\n'
            }
        }
    }
    content = content.trim()
    if (!content) {
        content = element.innerText
    }
    return content.replaceAll(/\n+/g, '\n').replaceAll(/ +/g, ' ').trim()
}

/**
 * 元素文本（删除连续空格和换行符）
 *
 * @param {HTMLElement|string} object
 * @returns text
 */
eko.cleanText = function(object) {
    let str = (typeof object == 'string') ? object : object?.innerText
    return str ? str.replaceAll(/\s+/g, ' ').trim() : ''
}

/**
 * sleep
 *
 * @param {number} time millisecond
 */
eko.sleep = function(time) {
    return new Promise(resolve => setTimeout(() => resolve(), time))
}

/**
 * 元素显示
 *
 * @param {HTMLElement} element
 */
eko.isDisplayed = function (element) {
    return element && window.getComputedStyle(element).getPropertyValue('display') != 'none'
}

/**
 * 点击
 *
 * @param {HTMLElement} element
 */
eko.click = function(element) {
    if (element.click) {
        element.click()
    } else {
        element.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        }))
    }
}

/**
 * 触发模拟输入
 */
eko.sendKeys = function(element, str, clear, keypress) {
    element.focus && element.focus()
    if (clear) {
        if (element.value == undefined) {
            element.textContent = ''
        } else {
            for (let i = 0; i < element.value.length; i++) {
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
            }
            element.value = ''
        }
    }
    if (keypress) {
        Array.from(str).forEach(key => {
            element.dispatchEvent(new KeyboardEvent('keypress', { key }))
        })
        element.value += str
        element.dispatchEvent(new Event('input'))
    } else {
        if (element.value == undefined) {
          element.textContent += str
        } else {
          element.value += str
        }
        element.dispatchEvent(new Event('input', { bubbles: true }))
    }
}

/**
 * 等待 DOM 的改变
 */
eko.waitForDomChanged = function (targetElement, fun, timeout, config, firstExecute) {
    targetElement = targetElement || document.body
    return new Promise((resolve) => {
        if (firstExecute) {
            let result = fun({})
            if (result) {
                resolve(result)
            }
        }
        var observer = { value: null }
        let timeId = setTimeout(() => {
            observer.value && observer.value.disconnect()
            resolve()
        }, timeout)
        observer.value = new MutationObserver((mutations) => {
            try {
                let result = fun(mutations)
                if (result) {
                    clearTimeout(timeId)
                    observer.value && observer.value.disconnect()
                    resolve(result)
                }
            } catch (e) {}
        });
        if (!config) {
            config = {}
        }
        observer.value.observe(targetElement, { attributes: true, childList: true, subtree: true, ...config })
    })
}

/**
 * 在 onload 之后等待页面加载完毕
 */
eko.waitLoaded = async function() {
    await eko.waitForDomChanged(document.body, () => document.readyState == 'complete', 5000, {}, true)
    await eko.sleep(500)
}

/**
 * 等待元素出现
 */
eko.waitForElementPresent = function (targetElement, cssSelector, timeout) {
    targetElement = targetElement || document.body
    return eko.waitForDomChanged(targetElement, () => targetElement.querySelector(cssSelector), timeout, { attributes: false }, true)
}

/**
 * 等待元素显示
 */
eko.waitForElementDisplayed = function (targetElement, cssSelector, timeout) {
    targetElement = targetElement || document.body
    return eko.waitForDomChanged(targetElement, () => {
        let element = targetElement.querySelector(cssSelector)
        if (element) {
            let visibility = window.getComputedStyle(element).getPropertyValue('display')
            if (visibility != 'none') {
                return element
            } else {
                return false
            }
        } else {
            return false
        }
    }, timeout, {}, true)
}

/**
 * 等待元素不存在
 */
eko.waitForElementNotPresent = function (targetElement, cssSelector, timeout) {
    targetElement = targetElement || document.body
    return eko.waitForDomChanged(targetElement, () => !targetElement.querySelector(cssSelector), timeout, { attributes: false }, true)
}

/**
 * 等待元素不可见
 */
eko.waitForElementNotDisplayed = function (targetElement, cssSelector, timeout) {
    targetElement = targetElement || document.body
    return eko.waitForDomChanged(targetElement, () => {
        let element = targetElement.querySelector(cssSelector)
        if (element) {
            let visibility = window.getComputedStyle(element).getPropertyValue('display')
            if (visibility != 'none') {
                return false
            } else {
                return true
            }
        } else {
            return true
        }
    }, timeout, {}, true)
}