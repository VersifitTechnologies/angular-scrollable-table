(function (angular) {
    'use strict';
    angular.module('scrollable-table', [])
        .directive('scrollableTable', ['$timeout', '$q', '$parse', function ($timeout, $q, $parse) {
            return {
                transclude: true,
                restrict: 'E',
                scope: {
                    rows: '=watch',
                    sortFn: '='
                },
                template: '<div class="scrollableContainer">' +
                    '<div class="headerSpacer"></div>' +
                    '<div class="scrollArea" ng-transclude></div>' +
                    '</div>',
                controller: ['$scope', '$element', '$attrs', function ($scope, $element, $attrs) {
                    // define an API for child directives to view and modify sorting parameters
                    this.getSortExpr = function () {
                        return $scope.sortExpr;
                    };
                    this.isAsc = function () {
                        return $scope.asc;
                    };
                    this.setSortExpr = function (exp) {
                        $scope.asc = true;
                        $scope.sortExpr = exp;
                    };
                    this.toggleSort = function () {
                        $scope.asc = !$scope.asc;
                    };

                    this.doSort = function (comparatorFn) {
                        if (comparatorFn) {
                            $scope.rows.sort(function (r1, r2) {
                                var compared = comparatorFn(r1, r2);
                                return $scope.asc ? compared : compared * -1;
                            });
                        } else {
                            $scope.rows.sort(function (r1, r2) {
                                var compared = defaultCompare(r1, r2);
                                return $scope.asc ? compared : compared * -1;
                            });
                        }
                    };

                    this.resizeColumn = function (){
                        waitForRender().then(fixHeaderWidths);
                    };

                    function defaultCompare(row1, row2) {
                        var exprParts = $scope.sortExpr.match(/(.+)\s+as\s+(.+)/);
                        var scope = {};
                        scope[exprParts[1]] = row1;
                        var x = $parse(exprParts[2])(scope);

                        scope[exprParts[1]] = row2;
                        var y = $parse(exprParts[2])(scope);

                        if (x === y) return 0;
                        return x > y ? 1 : -1;
                    }

                    function scrollToRow(row) {
                        var offset = $element.find(".headerSpacer").height();
                        var currentScrollTop = $element.find(".scrollArea").scrollTop();
                        $element.find(".scrollArea").scrollTop(currentScrollTop + row.position().top - offset);
                    }

                    $scope.$on('rowSelected', function (event, rowId) {
                        var row = $element.find(".scrollArea table tr[row-id='" + rowId + "']");
                        if (row.length === 1) {
                            // Ensure that the headers have been fixed before scrolling, to ensure accurate
                            // position calculations
                            $q.all([waitForRender(), headersAreFixed.promise]).then(function () {
                                scrollToRow(row);
                            });
                        }
                    });

                    // Set fixed widths for the table headers in case the text overflows.
                    // There's no callback for when rendering is complete, so check the visibility of the table
                    // periodically -- see http://stackoverflow.com/questions/11125078
                    function waitForRender() {
                        var deferredRender = $q.defer();
                        function wait() {
                            if ($element.find("table:visible").length === 0) {
                                $timeout(wait, 100);
                            } else {
                                deferredRender.resolve();
                            }
                        }

                        $timeout(wait);
                        return deferredRender.promise;
                    }

                    var headersAreFixed = $q.defer();

                    function fixHeaderWidths() {
                        if (!$element.find("thead th .th-inner").length)
                            $element.find("thead th").wrapInner('<div class="th-inner"></div>');

                        var headerPos = 1;//  1 is the width of right border;
                        $element.find("table th .th-inner").each(function (index, el) {
                            el = angular.element(el);
                            //var padding = el.outerWidth() - el.width();
                            var width = el.parent().width(),// - padding;   //to made header fit with parent.
                            // if it's the last header, add space for the scrollbar equivalent unless it's centered
                                lastCol = $element.find("table th:visible:last"),
                                headerWidth = width;
                            if (lastCol.css("text-align") !== "center") {
                                var hasScrollbar = $element.find(".scrollArea").height() < $element.find("table").height();
                                if (lastCol[0] == el.parent()[0] && hasScrollbar) {
                                    headerWidth += $element.find(".scrollArea").width() - $element.find("tbody tr").width();
                                    //th use the small one to avoid horizontal scroll
                                    //and th-inner use bigger one to fill scroll space.
                                    var _width = Math.min(headerWidth, width);
                                    headerWidth = Math.max(headerWidth, width);
                                    width = _width;
                                }
                            }
                            var minWidth = _getScale(el.parent().css('min-width')),
                                title = el.parent().attr("title");
                            width = Math.max(minWidth, width);
                            headerWidth = Math.max(minWidth, headerWidth);
                            el.css("width", headerWidth);
                            if (!title) {
                                title = el.children().length ? el.find(".title .ng-scope").html() : el.html();
                            }
                            el.attr("title", title.trim());

                            //following are resize stuff, to made th-inner position correct when dragging column.
                            // declare width to TH element to fix width of left columns when resizing column.
                            el.parent().css('width', width);
                            el.css("left", headerPos);
                            headerPos += width;
                        });
                        headersAreFixed.resolve();
                    }

                    angular.element(window).on('resize', fixHeaderWidths);

                    // when the data model changes, fix the header widths.  See the comments here:
                    // http://docs.angularjs.org/api/ng.$timeout
                    $scope.$watch('rows', function (newValue, oldValue) {
                        if (newValue) {
                            waitForRender().then(fixHeaderWidths);
                        }
                    });

                    $scope.asc = !$attrs.hasOwnProperty("desc");
                    $scope.sortAttr = $attrs.sortAttr;

                    $element.find(".scrollArea").scroll(function (event) {
                        $element.find("thead th .th-inner").css('margin-left', 0 - event.target.scrollLeft);
                    });
                }]
            };
        }])
        .directive('sortableHeader', ['$timeout', function (timeout) {
            return {
                transclude: true,
                scope: true,
                require: '^scrollableTable',
                template:
                    '<div>' +
                        '<div ng-mouseenter="enter()" ng-mouseleave="leave()">' +
                            '<div class="title" ng-transclude></div>' +
                            '<span class="orderWrapper">' +
                                '<span class="order" ng-show="focused || isActive()" ng-click="toggleSort($event)" ng-class="{active:isActive()}">' +
                                    '<i ng-show="isAscending()" class="glyphicon glyphicon-chevron-up"></i>' +
                                    '<i ng-show="!isAscending()" class="glyphicon glyphicon-chevron-down"></i>' +
                                '</span>' +
                            '</span>' +
                        '</div>' +
                        '<div class="resize-rod" ng-mousedown="resizing($event)"></div>' +
                    '</div>',
                link: function (scope, elm, attrs, tableController) {
                    var expr = attrs.on || "a as a." + attrs.col;
                    scope.element = angular.element(elm);
                    scope.isActive = function () {
                        return tableController.getSortExpr() === expr;
                    };
                    scope.toggleSort = function (e) {
                        if (scope.isActive()) {
                            tableController.toggleSort();
                        } else {
                            tableController.setSortExpr(expr);
                        }
                        tableController.doSort(scope[attrs.comparatorFn]);
                        e.preventDefault();
                    };
                    scope.isAscending = function () {
                        if (scope.focused && !scope.isActive()) {
                            return true;
                        } else {
                            return tableController.isAsc();
                        }
                    };

                    scope.enter = function () {
                        scope.focused = true;
                    };
                    scope.leave = function () {
                        scope.focused = false;
                    };

                    scope.resizing = function(e){
                        var startPoint = _getScale(scope.element.children().css('left')) + _getScale(scope.element.children().css('width')),
                            movingPos = e.pageX,
                            _document = angular.element(document),
                            _body = angular.element('body'),
                            coverPanel = angular.element('.scrollableContainer .resizing-cover'),
                            scaler = angular.element('<div class="scaler">');

                        _body.addClass('scrollable-resizing');
                        coverPanel.addClass('active');
                        angular.element('.scrollableContainer').append(scaler);
                        scaler.css('left', startPoint);

                        _document.bind('mousemove', function (e){
                            var offsetX = e.pageX - movingPos,
                                movedOffset = _getScale(scaler.css('left')) - startPoint,
                                widthOfActiveCol = _getScale(scope.element.css('width')),
                                minWidthOfActiveCol = _getScale(scope.element.css('min-width')),
                                widthOfNextColOfActive = _getScale(scope.element.next().css('width')),
                                minWidthOfNextColOfActive = _getScale(scope.element.next().css('min-width'));
                            movingPos = e.pageX;
                            e.preventDefault();
                            if((offsetX > 0 && widthOfNextColOfActive - movedOffset <= minWidthOfNextColOfActive)
                                || (offsetX < 0 && widthOfActiveCol + movedOffset <= minWidthOfActiveCol)){
                                //stopping resize if user trying to extension and the active/next column already minimised.
                                return;
                            }
                            scaler.css('left', _getScale(scaler.css('left')) + offsetX);
                        });
                        _document.bind('mouseup', function (e) {
                            e.preventDefault();
                            scaler.remove();
                            _body.removeClass('scrollable-resizing');
                            coverPanel.removeClass('active');
                            _document.unbind('mousemove');
                            _document.unbind('mouseup');

                            var offsetX = _getScale(scaler.css('left')) - startPoint,
                                newWidth = _getScale(scope.element.css('width')),
                                minWidth = _getScale(scope.element.css('min-width')),
                                widthOfNextColOfActive = _getScale(scope.element.next().css('width')),
                                minWidthOfNextColOfActive = _getScale(scope.element.next().css('min-width'));
//                            console.debug('next width=%s, min-width=%s', widthOfNextColOfActive, minWidthOfNextColOfActive);
                            if(offsetX > 0 && widthOfNextColOfActive - offsetX <= minWidthOfNextColOfActive){
                                offsetX = widthOfNextColOfActive - minWidthOfNextColOfActive;
                            }
                            scope.element.next().removeAttr('style');
                            newWidth += offsetX;
//                            console.debug('offsetX=%s, newWidth=%s, minWidth=%s', offsetX, newWidth, minWidth);
                            scope.element.css('width', Math.max(minWidth, newWidth));
                            tableController.resizeColumn();
                        });
                    };
                }
            };
        }]);

    function _getScale(sizeCss){
        return parseInt(sizeCss.replace(/px/, ''));
    }
})(angular);